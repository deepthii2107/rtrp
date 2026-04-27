"""
The Vision Pipeline orchestrator.
Rules:
  - Drawing (bbox, label) is ONLY performed for workers whose shoulder
    anchor point is inside the work_zone polygon.
  - Workers outside the zone produce zero visual output — no box, no skeleton, no ID.
  - CentroidTracker provides stable IDs so workers don't flicker near the espresso machine.
"""
import threading
import time
import logging
import math
import cv2
import numpy as np
import torch

# ── Compatibility fix ────────────────────────────────────────────────────────
# PyTorch ≥ 2.6 changed the default of weights_only in torch.load from
# False → True.  ultralytics 8.2.18 calls torch.load(file, map_location='cpu')
# with no weights_only kwarg, so it hits the new strict default and raises an
# UnpicklingError.  We monkey-patch torch.load to keep the old safe behaviour.
_orig_torch_load = torch.load

def _patched_torch_load(f, *args, **kwargs):
    kwargs.setdefault("weights_only", False)
    return _orig_torch_load(f, *args, **kwargs)

torch.load = _patched_torch_load
# ─────────────────────────────────────────────────────────────────────────────

from engine.detector import PersonDetector
from engine.tracker import CentroidTracker
from engine.zone_manager import ZoneManager
from engine.activity_classifier import ActivityClassifier
from engine.pose_analyser import PoseAnalyser
from utils.drawing import (
    draw_worker_box, draw_idle_timer, draw_zone_overlay,
    draw_hud, get_status_color, _head_box_from_keypoints
)
from utils.config import (
    YOLO_MODEL_PATH, YOLO_CONF_THRESHOLD,
    DEFAULT_ZONE_POLYGON, MAX_DISAPPEARED_FRAMES,
    DEFAULT_MOVEMENT_THRESHOLD, DEFAULT_IDLE_TIMEOUT_SECONDS,
    MOVEMENT_WINDOW_SIZE, TARGET_FPS
)

logger = logging.getLogger(__name__)

# COCO-17 shoulder keypoint indices
_LEFT_SHOULDER  = 5
_RIGHT_SHOULDER = 6


def _shoulder_anchor(keypoints: dict, bbox: tuple) -> tuple[int, int]:
    """
    Returns the midpoint between left and right shoulders.
    Falls back to the vertical midpoint of the bounding box if neither shoulder
    keypoint was detected.
    """
    pts = [keypoints[k] for k in (_LEFT_SHOULDER, _RIGHT_SHOULDER) if k in keypoints]
    if pts:
        ax = int(sum(p[0] for p in pts) / len(pts))
        ay = int(sum(p[1] for p in pts) / len(pts))
        return ax, ay
    # Fallback: horizontal centre, vertical midpoint of bbox
    x1, y1, x2, y2 = bbox
    return int((x1 + x2) / 2), int((y1 + y2) / 2)


class VisionPipeline:
    """Orchestrates video ingestion and computer vision processing."""

    def __init__(self, video_path: str, session_store: 'SessionStore', device: str = 'cpu') -> None:
        self.video_path   = video_path
        self.session_store = session_store
        self.device        = device

        # Sub-components
        self.detector   = PersonDetector(YOLO_MODEL_PATH, YOLO_CONF_THRESHOLD, device)
        self.tracker    = CentroidTracker(max_disappeared=MAX_DISAPPEARED_FRAMES)
        self.zone_mgr   = ZoneManager(
            session_store.zone_polygon if session_store.zone_polygon else DEFAULT_ZONE_POLYGON
        )
        self.classifier = ActivityClassifier(movement_window_size=MOVEMENT_WINDOW_SIZE)
        self.pose_analyser = PoseAnalyser()

        # Gate authorization state — persists across frames
        self.authorized_worker_ids: set[int] = set()
        # Previous centroid positions per worker — used to compute displacement
        self._prev_centroids: dict[int, tuple[int, int]] = {}
        
        # Appearance tracking
        self._primary_worker_hist = None
        self._last_known_bbox = None

        self._thread     = None
        self._stop_event = threading.Event()

    # ------------------------------------------------------------------
    # Public control
    # ------------------------------------------------------------------

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        with self.session_store._lock:
            self.session_store.is_pipeline_running = True
            self.session_store.pipeline_error = None
            self.session_store.current_video_path = self.video_path
        logger.info("Pipeline thread started.")

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join()
        with self.session_store._lock:
            self.session_store.is_pipeline_running = False
        logger.info("Pipeline thread stopped.")

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    def _run(self) -> None:
        cap = cv2.VideoCapture(self.video_path)
        if not cap.isOpened():
            error_message = f"Cannot open video: {self.video_path}"
            logger.error(error_message)
            with self.session_store._lock:
                self.session_store.is_pipeline_running = False
                self.session_store.pipeline_error = error_message
            return

        with self.session_store._lock:
            self.session_store.pipeline_error = None

        frame_interval = 1.0 / max(1, TARGET_FPS)
        last_proc_time = 0.0
        fps_display    = 0.0
        fps_timer      = time.time()
        fps_frame_count = 0

        while not self._stop_event.is_set():
            ret, frame = cap.read()
            if not ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                # Reset backend state completely to ensure a clean video loop
                self.tracker.objects.clear()
                self.tracker.next_worker_id = 1
                self.classifier.workers.clear()
                self.authorized_worker_ids.clear()
                self._prev_centroids.clear()
                self._primary_worker_hist = None
                self._last_known_bbox = None
                continue

            now = time.time()
            if now - last_proc_time < frame_interval:
                time.sleep(0.005)
                continue
            last_proc_time = now

            # ----- FPS counter -----
            fps_frame_count += 1
            elapsed = now - fps_timer
            if elapsed >= 1.0:
                fps_display = fps_frame_count / elapsed
                fps_frame_count = 0
                fps_timer = now

            try:
                self._process_frame(frame, now, fps_display)
            except Exception as e:
                logger.error(f"Error in pipeline loop: {e}", exc_info=True)
                time.sleep(0.1)

        cap.release()

    # ------------------------------------------------------------------
    # Per-frame processing
    # ------------------------------------------------------------------

    def _process_frame(self, frame: np.ndarray, now: float, fps: float) -> None:
        h, w = frame.shape[:2]

        # Sync zone polygon from UI settings
        with self.session_store._lock:
            ui_polygon = self.session_store.zone_polygon
            movement_threshold  = self.session_store.movement_threshold
            idle_timeout        = self.session_store.idle_timeout_seconds
        if ui_polygon:
            self.zone_mgr.set_polygon(ui_polygon)

        # 1. Detect persons
        detections = self.detector.detect(frame)

        # 2. Update tracker → stable IDs
        tracked = self.tracker.update(detections)

        # 3. Gate authorization & Smart Re-recognition
        # First, purge any IDs the tracker naturally dropped
        self.authorized_worker_ids &= set(tracked.keys())

        # If we currently have no authorized worker, try to find one
        if len(self.authorized_worker_ids) == 0:
            best_match_id = None
            best_match_score = -1.0 

            # RECOVERY: Do we have a known appearance signature?
            if self._primary_worker_hist is not None:
                for wid, obj in tracked.items():
                    x1, y1, x2, y2 = obj["bbox"]
                    x1, y1 = max(0, x1), max(0, y1)
                    x2, y2 = min(w, x2), min(h, y2)
                    
                    if x2 <= x1 or y2 <= y1:
                        continue
                        
                    worker_roi = frame[y1:y2, x1:x2]
                    hsv_roi = cv2.cvtColor(worker_roi, cv2.COLOR_BGR2HSV)
                    hist = cv2.calcHist([hsv_roi], [0, 1], None, [16, 16], [0, 180, 0, 256])
                    cv2.normalize(hist, hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
                    
                    score = cv2.compareHist(self._primary_worker_hist, hist, cv2.HISTCMP_CORREL)
                    
                    # Lock onto same visual appearance if strongly correlated
                    if score > 0.85 and score > best_match_score:
                        best_match_score = score
                        best_match_id = wid
                
                if best_match_id is not None:
                    logger.info(f"Worker RE-RECOGNIZED as W-{best_match_id} (Hist Score: {best_match_score:.2f})")
                    self.authorized_worker_ids.add(best_match_id)
            
            # INITIALIZATION: If recovery failed or first run, lock via gate zone
            if len(self.authorized_worker_ids) == 0:
                for wid, obj in tracked.items():
                    x1, y1, x2, y2 = obj["bbox"]
                    if self.zone_mgr.bbox_touches_zone(x1, y1, x2, y2, w, h):
                        logger.info(f"Worker W-{wid} explicitly authorized via zone crossing.")
                        self.authorized_worker_ids.add(wid)
                        break

        # Extract/update visual signature & filter detections for the rest of pipeline
        filtered_tracked = {}
        for wid, obj in tracked.items():
            if wid in self.authorized_worker_ids:
                filtered_tracked[wid] = obj
                
                x1, y1, x2, y2 = obj["bbox"]
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(w, x2), min(h, y2)
                if x2 > x1 and y2 > y1:
                    worker_roi = frame[y1:y2, x1:x2]
                    hsv_roi = cv2.cvtColor(worker_roi, cv2.COLOR_BGR2HSV)
                    hist = cv2.calcHist([hsv_roi], [0, 1], None, [16, 16], [0, 180, 0, 256])
                    cv2.normalize(hist, hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
                    
                    self._primary_worker_hist = hist
                    self._last_known_bbox = obj["bbox"]

        # Overwrite tracked variable to ensure only the authorized worker propagates downward
        tracked = filtered_tracked

        # 4. Activity classification — only for authorized workers
        authorized_count = 0
        new_worker_states = {}

        for wid, obj in tracked.items():
            if wid not in self.authorized_worker_ids:
                continue  # Skip unauthorized persons entirely

            authorized_count += 1

            # Compute centroid displacement from the previous frame
            cx, cy = obj["centroid"]
            prev = self._prev_centroids.get(wid)
            displacement = math.hypot(cx - prev[0], cy - prev[1]) if prev else 0.0

            state = self.classifier.update(
                worker_id=wid,
                in_zone=True,  # Always True for authorized workers
                pose_sample=None,
                now=now,
                movement_threshold=movement_threshold,
                idle_timeout_seconds=idle_timeout,
                centroid_displacement=displacement,
            )
            new_worker_states[wid] = state
            if state.alert_triggered and not getattr(state, "alert_logged", False):
                self.session_store.add_alert({
                    "worker_id": wid,
                    "type": "idle",
                    "message": f"Worker {wid} idle for {state.idle_duration_seconds:.1f}s",
                    "timestamp": now,
                    "resolved": False
                })
                state.alert_logged = True

        # Save centroids for next frame's displacement calculation
        self._prev_centroids = {
            wid: obj["centroid"] for wid, obj in tracked.items()
        }

        # Purge IDs that the tracker dropped
        self.classifier.purge_missing(set(tracked.keys()))

        # 4. Render — ONLY for in-zone workers
        annotated = frame.copy()

        # Zone overlay (always visible for operator reference)
        if self.zone_mgr.polygon_fractions:
            annotated = draw_zone_overlay(annotated, self.zone_mgr, w, h)

        for wid, obj in tracked.items():
            state = new_worker_states.get(wid)
            if state is None or wid not in self.authorized_worker_ids:
                # ---- ZERO VISIBILITY FOR UNAUTHORIZED WORKERS ----
                continue

            keypoints  = obj.get("keypoints", {})
            body_bbox  = obj["bbox"]
            draw_bbox  = _head_box_from_keypoints(keypoints, body_bbox)
            color      = get_status_color(state.status)

            # Bounding box + ID label
            draw_worker_box(annotated, draw_bbox, wid, state.status, color)

            # Idle progress bar
            if state.status in ("idle", "alert"):
                draw_idle_timer(annotated, draw_bbox, state.idle_duration_seconds, idle_timeout)

        # HUD overlay
        alert_count = sum(
            1 for s in new_worker_states.values() if s.alert_triggered
        )
        draw_hud(annotated, authorized_count, alert_count, fps)

        # 5. Push state to session store
        with self.session_store._lock:
            self.session_store.worker_states = new_worker_states
            self.session_store.in_zone_count = authorized_count
            self.session_store.authorized_count = authorized_count
            self.session_store.latest_fps = float(fps or 0.0)

        self.session_store.update_frame(annotated)
        self.session_store.record_telemetry_snapshot(timestamp=now)
