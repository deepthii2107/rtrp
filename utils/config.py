"""
Central configuration for the Coffee Shop Worker Activity Monitor.
Contains all magic numbers and default settings.
"""

# --- Video Processing ---
TARGET_FPS = 1                        # Frames to process per second
PROCESS_WIDTH = 640
PROCESS_HEIGHT = 480

# --- Detection ---
YOLO_MODEL_PATH = "yolov8n-pose.pt"
YOLO_CONF_THRESHOLD = 0.25
YOLO_PERSON_CLASS_ID = 0

# --- Entry Gate Polygon (placed at entrance/door — adjustable via UI) ---
# Expressed as fractions of frame (0.0–1.0) for resolution independence
# Tight bottom-right gate: narrow strip acting as the physical entry threshold
DEFAULT_ZONE_POLYGON = [
    (0.35, 0.50),   # top-left
    (0.65, 0.50),   # top-right
    (0.65, 0.90),   # bottom-right
    (0.35, 0.90),   # bottom-left
]

# --- Centroid Tracker ---
MAX_DISAPPEARED_FRAMES = 15           # Frames before a worker ID is retired

# --- Activity Classification ---
DEFAULT_MOVEMENT_THRESHOLD = 8.0      # Pixel movement to count as "active"
DEFAULT_IDLE_TIMEOUT_SECONDS = 120    # Seconds idle before alert triggers (2 minutes)
MOVEMENT_WINDOW_SIZE = 5             # Rolling window of pose samples

# --- Colours (BGR) ---
COLOR_ACTIVE = (0, 200, 80)
COLOR_IDLE   = (0, 60, 255)
COLOR_ZONE   = (0, 220, 255)
COLOR_ALERT  = (0, 0, 220)
