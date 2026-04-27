# Coffee Shop Worker Activity Monitor

## 1. Project Overview
This project is an automated vision pipeline crafted to monitor coffee shop staff activity. By processing a simulated CCTV feed, the system tracks each worker via a YOLO detection and customized Centroid tracker. Workers inside designated "Work Zones" are subject to posture analysis using MediaPipe to determine activity states (Active vs Idle/Alert). A multi-page Streamlit dashboard displays real-time overlays, active alert cards, aggregate analytics, and allows dynamic parameter tuning.

## 2. Prerequisites
- Python 3.10+
- `pip` package manager
- Adequate CPU or an NVIDIA GPU for faster inference

## 3. Installation
1. Clone this repository or download the source code files.
2. Install dependencies using pip:
   ```bash
   pip install -r requirements.txt
   ```
   *Note: The YOLOv8 weights (`yolov8n.pt`) and MediaPipe models will automatically download on their first run.*

## 4. Running the App
1. Place your video in the project root, or keep note of its full path.
2. Run the application via Streamlit:
   ```bash
   streamlit run app.py
   ```
3. Navigate to the local URL provided by Streamlit.

Optional: set a custom input video before starting the app.

```powershell
$env:VIDEO_PATH="my-new-video.mp4"
streamlit run app.py
```

If `VIDEO_PATH` is not set, the app still defaults to `reference_video.mp4`.

### FastAPI + Frontend Dev Mode

Run both the FastAPI backend and the Vite frontend with one command from the repo root:

```powershell
.\start-dev.ps1
```

This starts:
- frontend at `http://127.0.0.1:3000`
- backend at `http://127.0.0.1:8000`

To stop both tracked services:

```powershell
.\stop-dev.ps1
```

Runtime logs are written to the repo `logs/` directory.

## 5. Configuration
All central settings and magic numbers are housed within `utils/config.py`. Adjust threshold defaults, tracking parameters, and color hex values there. For real-time overrides of sensitivity and idle bounds, utilize the sliders on the Analytics page of the UI.

## 6. Phase 2 Migration Note
The `engine/` modular directory holds the complete Computer Vision and State Machine capability, while keeping **zero dependency on Streamlit** or front-end libraries. In the impending Phase 2 upgrade (FastAPI + live RTSP streams), the `engine/` can be copied unchanged to the server backend. The `SessionStore` safely delegates the application state via locking, preserving clean multi-threaded design.

## 7. Known CPU Limitations
Due to CPU constraints on the target hardware, the AI inference is intentionally configured to analyze frames at **1 FPS** (dynamically skipping frames relative to the input video FPS). MediaPipe complexity is fixed strictly to `0` (the fastest posture model), and only runs for workers currently inside the designated Work Zone to maintain system fluidity and eliminate thermal throttling.
