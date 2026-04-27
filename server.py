"""
FastAPI streaming server for the Coffee Shop Worker Activity Monitor.

Replaces the Streamlit UI layer only — all detection logic is unchanged.

Endpoints:
    GET /video   — MJPEG multipart stream of annotated frames
    GET /health  — JSON liveness/status check

Run:
    uvicorn server:app --host 0.0.0.0 --port 8000
"""

import time
import logging
from contextlib import asynccontextmanager

import cv2
import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse

# ── PyTorch ≥ 2.6 compatibility fix ──────────────────────────────────────────
# ultralytics calls torch.load without weights_only, hitting the new strict
# default and raising UnpicklingError.  Monkey-patch before any ultralytics
# import so YOLO .pt files load cleanly.
_orig_torch_load = torch.load

def _patched_torch_load(f, *args, **kwargs):
    kwargs.setdefault("weights_only", False)
    return _orig_torch_load(f, *args, **kwargs)

torch.load = _patched_torch_load
# ─────────────────────────────────────────────────────────────────────────────

from state.session_store import SessionStore
from utils.config import DEFAULT_ZONE_POLYGON
from utils.video_source import get_video_path
from engine.pipeline import VisionPipeline

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Shared state (module-level singleton — safe because uvicorn is single-process)
# ---------------------------------------------------------------------------
store = SessionStore()
store.zone_polygon = DEFAULT_ZONE_POLYGON

SERVER_START_TIME = time.time()

from typing import Optional

pipeline: Optional[VisionPipeline] = None

# ---------------------------------------------------------------------------
# Lifespan: start / stop the pipeline thread
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the VisionPipeline background thread on startup; stop on shutdown."""
    global pipeline

    device = "cuda" if torch.cuda.is_available() else "cpu"
    video_path = get_video_path()
    logger.info(f"Using device: {device}")

    pipeline = VisionPipeline(
        video_path=video_path,
        session_store=store,
        device=device,
    )
    pipeline.start()
    logger.info("VisionPipeline started.")

    yield  # application runs here

    logger.info("Shutting down VisionPipeline…")
    pipeline.stop()
    logger.info("VisionPipeline stopped.")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Coffee Shop Worker Monitor",
    description="Real-time MJPEG stream of annotated worker activity.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ---------------------------------------------------------------------------
# Frame generator for MJPEG streaming
# ---------------------------------------------------------------------------

def _frame_generator():
    """
    Continuously pull the latest processed frame from the SessionStore and
    yield it as a multipart/x-mixed-replace MIME chunk.

    Boundary: 'frame'
    Encoding: JPEG
    """
    while True:
        frame = store.get_frame()

        if frame is None:
            # Pipeline not ready yet — wait briefly and retry
            time.sleep(0.05)
            continue

        # Encode BGR frame as JPEG
        success, encoded = cv2.imencode(
            ".jpg",
            frame,
            [cv2.IMWRITE_JPEG_QUALITY, 85],
        )
        if not success:
            time.sleep(0.01)
            continue

        jpeg_bytes = encoded.tobytes()

        # Yield one multipart chunk
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + jpeg_bytes
            + b"\r\n"
        )

        # Throttle to ~25 fps maximum on the network side
        time.sleep(0.04)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get(
    "/video",
    summary="Annotated MJPEG video stream",
    response_description="Continuous multipart/x-mixed-replace MJPEG stream",
)
def video_stream():
    """
    Stream processed frames with detection overlays.

    Open in a browser, VLC, or any MJPEG-capable client:
        http://localhost:8000/video
    """
    return StreamingResponse(
        _frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get(
    "/health",
    summary="Server health check",
)
def health():
    """Returns current pipeline status and server uptime."""
    current_time = time.time()
    return JSONResponse({
        "status": "ok",
        "pipeline_running": pipeline.is_running() if pipeline else False,
        "video_path": store.current_video_path,
        "pipeline_error": store.pipeline_error,
        "uptime_seconds": current_time - SERVER_START_TIME,
        "start_time": SERVER_START_TIME,
        "latest_fps": store.get_latest_fps(),
    })

@app.get("/workers")
def get_workers():
    return JSONResponse({
        "workers": store.serialize_workers(),
    })

@app.get("/alerts")
def get_alerts():
    return JSONResponse({
        "alerts": store.get_active_alerts(),
        "history_count": len(store.get_alert_history()),
    })

@app.get("/analytics")
def get_analytics():
    return JSONResponse(store.build_analytics_snapshot(server_start_time=SERVER_START_TIME))
