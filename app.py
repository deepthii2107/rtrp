import os

import streamlit as st
import time
import logging
import torch

# ── Compatibility fix ────────────────────────────────────────────────────────
# PyTorch ≥ 2.6 changed torch.load's default weights_only from False → True.
# ultralytics 8.2.18 calls torch.load without weights_only, so it hits the new
# strict default and raises an UnpicklingError for every YOLO .pt file.
# Monkey-patching torch.load here (before any ultralytics import) is the
# simplest forward-compatible fix that doesn't require downgrading PyTorch.
_orig_torch_load = torch.load

def _patched_torch_load(f, *args, **kwargs):
    kwargs.setdefault("weights_only", False)
    return _orig_torch_load(f, *args, **kwargs)

torch.load = _patched_torch_load
# ─────────────────────────────────────────────────────────────────────────────

from state.session_store import SessionStore
from utils.config import DEFAULT_ZONE_POLYGON
from utils.video_source import get_video_path
try:
    from engine.pipeline import VisionPipeline
except ImportError:
    st.error("Engine module not found. Run application from repository root.")

# Set up logging early
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def main():
    video_path = get_video_path()

    st.set_page_config(
        page_title="Coffee Shop Worker Monitor",
        page_icon="☕",
        layout="wide",
        initial_sidebar_state="collapsed"
    )

    if "store" not in st.session_state:
        st.session_state.store = SessionStore()
        # Initialize default configs into the store
        st.session_state.store.zone_polygon = DEFAULT_ZONE_POLYGON

    if "pipeline" not in st.session_state:
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        logger.info(f"Using {device} for inference")

        try:
            pipeline = VisionPipeline(
                video_path=video_path,
                session_store=st.session_state.store,
                device=device
            )
            pipeline.start()
            st.session_state.pipeline = pipeline
        except FileNotFoundError as e:
            st.error(f"Cannot initialize Pipeline. {e}")
            st.warning(f"Please ensure the configured video exists. Current VIDEO_PATH: {video_path}")
            st.stop()
        except Exception as e:
            st.error(f"An unexpected error occurred: {e}")
            st.stop()

    # --- Navigation ---
    pages = {
        "🎥 Live Monitor": [st.Page("ui/page_monitor.py", title="Live Monitor")],
        "⚠️ Active Alerts": [st.Page("ui/page_alerts.py", title="Active Alerts")],
        "👥 Worker Ledger": [st.Page("ui/page_ledger.py", title="Worker Ledger")],
        "📈 Analytics & Settings": [st.Page("ui/page_analytics.py", title="Analytics & Settings")]
    }

    # Use the native Streamlit page router (available in newer Streamlit versions > 1.35)
    # Since we don't have guaranteeing 1.35 st.navigation() on the very dot (although >=1.35.0 is requested),
    # let's fallback to typical explicit st.sidebar radios or multipage approach if st.navigation isn't widely used
    # But wait, 1.35 introduced simpler navigation. Let's use the sidebar radio approach to be completely safe while adhering strictly to request.
    
    st.sidebar.title("Navigation")
    selection = st.sidebar.radio("Go to:", list(pages.keys()))

    if selection == "🎥 Live Monitor":
        import ui.page_monitor as page_mod
        page_mod.render()
    elif selection == "⚠️ Active Alerts":
        import ui.page_alerts as page_mod
        page_mod.render()
    elif selection == "👥 Worker Ledger":
        import ui.page_ledger as page_mod
        page_mod.render()
    elif selection == "📈 Analytics & Settings":
        import ui.page_analytics as page_mod
        page_mod.render()

    # Non-blocking auto refresh loop.
    time.sleep(1)
    st.rerun()

if __name__ == "__main__":
    main()
