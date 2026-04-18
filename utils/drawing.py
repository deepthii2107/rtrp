"""
Visual annotation helpers using OpenCV.
Renders UI natively onto processed video frames.
"""
import cv2
import numpy as np
from typing import Dict, Any, Tuple

from utils.config import COLOR_ACTIVE, COLOR_IDLE, COLOR_ALERT, COLOR_ZONE

def get_status_color(status: str) -> Tuple[int, int, int]:
    """Returns color associated with a worker state."""
    if status == "active":
        return COLOR_ACTIVE
    elif status == "alert":
        return COLOR_ALERT
    elif status == "idle":
        return COLOR_IDLE
    else:  # outside or unknown
        return (180, 180, 180)  # gray

def _head_box_from_keypoints(
    keypoints: Dict[int, Tuple[float, float]],
    body_bbox: Tuple[int, int, int, int]
) -> Tuple[int, int, int, int]:
    """
    Computes a square bounding box centred on the detected head.

    Uses YOLO pose keypoints: nose (0), left ear (3), right ear (4).
    Falls back to the full-body bounding box when no head keypoints exist.

    Keypoint coordinates are already in original-frame pixel space
    (the tracker rescales them before storing).
    """
    head_pts = [keypoints[k] for k in (0, 3, 4) if k in keypoints]
    if not head_pts:
        return body_bbox

    cx = int(sum(p[0] for p in head_pts) / len(head_pts))
    cy = int(sum(p[1] for p in head_pts) / len(head_pts))

    bx1, _, bx2, _ = body_bbox
    box_size = max(30, int((bx2 - bx1) * 0.4))
    half = box_size // 2
    return (cx - half, cy - half, cx + half, cy + half)

def draw_worker_box(
    frame: np.ndarray,
    bbox: Tuple[int, int, int, int],
    worker_id: int,
    status: str,
    color: Tuple[int, int, int]
) -> None:
    """Draws a bounding box and a formatted tag above the worker."""
    x1, y1, x2, y2 = bbox
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

    label = f"W-{worker_id} | {status.upper()}"
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.5
    thickness = 1
    (ext_w, ext_h), _ = cv2.getTextSize(label, font, font_scale, thickness)

    cv2.rectangle(frame, (x1, max(0, y1 - ext_h - 10)), (x1 + ext_w + 10, y1), color, -1)
    cv2.putText(frame, label, (x1 + 5, max(5, y1 - 5)), font, font_scale, (255, 255, 255), thickness, cv2.LINE_AA)

def draw_idle_timer(frame: np.ndarray, bbox: Tuple[int, int, int, int], idle_seconds: float, idle_timeout: float) -> None:
    """Draws a progress bar below the box denoting how close worker is to alerting."""
    if idle_seconds <= 0:
        return

    x1, y1, x2, y2 = bbox
    bar_width = x2 - x1
    ratio = min(1.0, idle_seconds / idle_timeout)
    fill_width = int(bar_width * ratio)

    cv2.rectangle(frame, (x1, y2 + 5), (x2, y2 + 15), (100, 100, 100), -1)
    cv2.rectangle(frame, (x1, y2 + 5), (x1 + fill_width, y2 + 15), (0, 165, 255), -1)

def draw_zone_overlay(frame: np.ndarray, zone_manager: Any, frame_w: int, frame_h: int) -> np.ndarray:
    """Delegates to ZoneManager's internal drawing utility."""
    return zone_manager.draw_zone(frame, COLOR_ZONE, alpha=0.3)

def draw_hud(frame: np.ndarray, worker_count: int, alert_count: int, fps: float) -> None:
    """Draws global metrics indicating load and alert count."""
    font = cv2.FONT_HERSHEY_SIMPLEX
    cv2.putText(frame, f"FPS: {fps:.1f}", (20, 30), font, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(frame, f"Workers: {worker_count}", (20, 60), font, 0.7, COLOR_ACTIVE if worker_count > 0 else (255, 255, 255), 2, cv2.LINE_AA)

    alert_color = COLOR_ALERT if alert_count > 0 else COLOR_ACTIVE
    cv2.putText(frame, f"Alerts: {alert_count}", (20, 90), font, 0.7, alert_color, 2, cv2.LINE_AA)

def annotate_full_frame(
    frame: np.ndarray,
    tracked_workers: Dict[int, Dict[str, Any]],
    worker_states: Dict[int, Any],
    zone_manager: Any,
    idle_timeout: float,
    fps: float
) -> np.ndarray:
    """Master rendering loop drawing on a clean frame copy."""
    h, w = frame.shape[:2]
    annotated = frame.copy()

    # Draw zone first (bottom-layer)
    if zone_manager and zone_manager.polygon_fractions:
        annotated = draw_zone_overlay(annotated, zone_manager, w, h)

    workers_in_zone = 0
    alerts = 0

    for wid, obj in tracked_workers.items():
        state = worker_states.get(wid)
        if not state:
            continue

        status = state.status if state else "outside"
        color = get_status_color(status)

        body_bbox = obj["bbox"]
        keypoints = obj.get("keypoints", {})
        draw_bbox = _head_box_from_keypoints(keypoints, body_bbox)

        draw_worker_box(annotated, draw_bbox, wid, status, color)

        if state.status != "outside":
            workers_in_zone += 1
            if status in ("idle", "alert"):
                draw_idle_timer(annotated, draw_bbox, state.idle_duration_seconds, idle_timeout)

        if state.alert_triggered:
            alerts += 1

    # Draw HUD (top-layer)
    draw_hud(annotated, workers_in_zone, alerts, fps)

    return annotated
