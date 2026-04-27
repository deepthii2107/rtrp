"""
Page 4 — Analytics & Settings
Displays KPI charts and sliders for configuring thresholds dynamically.
"""
import streamlit as st
import pandas as pd
import time

from state.session_store import SessionStore
from utils.config import DEFAULT_MOVEMENT_THRESHOLD, DEFAULT_IDLE_TIMEOUT_SECONDS, TARGET_FPS, YOLO_MODEL_PATH
from utils.video_source import get_video_path

def render() -> None:
    st.header("📈 Analytics & Settings")
    
    store: SessionStore = st.session_state.store
    
    # Initialize history lists in session state for fast UI tracking
    if "occupancy_history" not in st.session_state:
        st.session_state.occupancy_history = []
    if "alert_history_counts" not in st.session_state:
        st.session_state.alert_history_counts = []
        
    workers = store.get_workers()
    alerts = store.get_alerts()
    
    in_zone_count = sum(1 for w in workers.values() if w.status != "outside")
    active_count = sum(1 for w in workers.values() if w.status == "active")
    idle_count = sum(1 for w in workers.values() if w.status in ["idle", "alert"])
    
    st.session_state.occupancy_history.append({"time": time.time(), "count": in_zone_count})
    if len(st.session_state.occupancy_history) > 300:
         st.session_state.occupancy_history.pop(0)
         
    # ---- SECTION A: KPI CHARTS ----
    st.subheader("KPI Dashboards")
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.write("**Zone Occupancy Over Time**")
        if len(st.session_state.occupancy_history) > 0:
            df_occ = pd.DataFrame(st.session_state.occupancy_history)
            df_occ['time'] = pd.to_datetime(df_occ['time'], unit='s')
            df_occ = df_occ.set_index('time')
            st.line_chart(df_occ)
        else:
            st.info("Gathering data...")
            
    with col2:
        st.write("**Activity Ratio (Current)**")
        if active_count > 0 or idle_count > 0:
            df_ratio = pd.DataFrame({
                "Status": ["Active", "Idle/Alert"],
                "Count": [active_count, idle_count]
            }).set_index("Status")
            
            import plotly.express as px
            fig = px.pie(df_ratio, values='Count', names=df_ratio.index, hole=0.4, 
                         color=df_ratio.index, color_discrete_map={'Active':'#00d450', 'Idle/Alert':'#ff3c00'})
            fig.update_layout(margin=dict(t=0, b=0, l=0, r=0))
            st.plotly_chart(fig, use_container_width=True)
        else:
             st.info("No workers in zone to compare.")
             
    st.write("---")
             
    # ---- SECTION B: SENSITIVITY SETTINGS ----
    st.subheader("System Settings")
    
    m_thresh = st.slider("Movement Threshold (pixels)", 1, 50, value=int(store.movement_threshold))
    i_timeout = st.slider("Idle Alert Timeout (seconds)", 5, 300, value=int(store.idle_timeout_seconds))
    c_thresh = st.slider("Confidence Threshold", 0.0, 1.0, value=float(store.detection_confidence), step=0.01)
    
    if (m_thresh != store.movement_threshold or 
        i_timeout != store.idle_timeout_seconds or 
        c_thresh != store.detection_confidence):
         with store._lock:
              store.movement_threshold = float(m_thresh)
              store.idle_timeout_seconds = float(i_timeout)
              store.detection_confidence = float(c_thresh)
         st.success("Settings updated and applied to engine immediately.")
         
    st.write("---")
         
    # ---- SECTION C: SYSTEM INFO ----
    st.subheader("System Information")
    
    import torch
    dev = "CUDA (GPU)" if torch.cuda.is_available() else "CPU"
    video_path = get_video_path()
    
    st.code(f"""
Video Source: {video_path}
Device in Use: {dev}
Model: {YOLO_MODEL_PATH}
Target FPS: {TARGET_FPS} (measured dynamically in HUD)
    """)
