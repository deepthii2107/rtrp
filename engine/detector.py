"""
YOLO Person Detector wrapper.
Identifies people in video frames and returns their bounding boxes.
"""
import logging
import torch
from typing import List, Dict, Any, Tuple
import numpy as np

# ── Compatibility fix ────────────────────────────────────────────────────────
# PyTorch ≥ 2.6 changed torch.load's default weights_only from False → True.
# ultralytics 8.2.18's internal torch_safe_load() calls torch.load without
# the weights_only kwarg, so it hits the new default and raises an
# UnpicklingError for every YOLO .pt file.
# Fix: monkey-patch torch.load so it always passes weights_only=False when
# called from within the ultralytics package.
_original_torch_load = torch.load

def _patched_torch_load(f, *args, **kwargs):
    kwargs.setdefault("weights_only", False)
    return _original_torch_load(f, *args, **kwargs)

torch.load = _patched_torch_load
# ─────────────────────────────────────────────────────────────────────────────

try:
    from ultralytics import YOLO
except ImportError:
    logging.warning("ultralytics module not found. YOLO model won't load.")
    YOLO = None

logger = logging.getLogger(__name__)

class PersonDetector:
    """Wraps the YOLO object detection model, specialized for person detection."""

    def __init__(self, model_path: str, conf: float, device: str) -> None:
        """
        Initializes the PersonDetector.
        
        Args:
            model_path: Path to the YOLOv8 model weights (.pt file).
            conf: Confidence threshold for detections.
            device: 'cuda' or 'cpu' device for inference.
        """
        self.conf = conf
        self.device = device
        
        logger.info(f"Loading YOLO model {model_path} on device {device}...")
        try:
            self.model = YOLO(model_path)
            logger.info("YOLO model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load YOLO model: {e}")
            self.model = None

    def detect(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Detects persons in the given frame.
        
        Args:
            frame: A BGR numpy array representing the image.
            
        Returns:
            A list of detections. Each detection is a dictionary:
            [
              {"bbox": (x1, y1, x2, y2), "conf": float, "keypoints": {idx: (x,y)}},
              ...
            ]
            Coordinates are in pixels of the passed frame.
        """
        if self.model is None:
            return []

        try:
            results = self.model(frame, classes=[0], conf=self.conf, verbose=False)
            boxes = results[0].boxes
            # keypoints are only present for pose models
            kps_data = results[0].keypoints  # None for non-pose models
            
            detections = []
            for i, box in enumerate(boxes):
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                conf = box.conf[0].item()

                # Extract nose (0), left ear (3), right ear (4) from COCO-17 keypoints
                keypoints: Dict[int, Tuple[float, float]] = {}
                if kps_data is not None and i < len(kps_data.xy):
                    kp_xy = kps_data.xy[i]  # shape (17, 2)
                    for kp_idx in (0, 3, 4, 5, 6):
                        if kp_idx < len(kp_xy):
                            kx, ky = kp_xy[kp_idx].tolist()
                            if kx > 0 and ky > 0:  # skip undetected keypoints
                                keypoints[kp_idx] = (float(kx), float(ky))

                detections.append({
                    "bbox": (int(x1), int(y1), int(x2), int(y2)),
                    "conf": float(conf),
                    "keypoints": keypoints
                })
            return detections
        except Exception as e:
            logger.error(f"YOLO inference failed: {e}")
            return []
