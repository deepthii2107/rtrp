"""
Page 1 — Live Monitor
Displays the real-time annotated CCTV feed and zone metadata.
"""
import streamlit as st
import cv2

from state.session_store import SessionStore

def render() -> None:
    st.header("🎥 Live Monitor")
    
    store: SessionStore = st.session_state.store
    
    alerts = store.get_alerts()
    active_alerts = [a for a in alerts if not a.get("resolved", False)]
    
    if len(active_alerts) > 0:
        st.error("🚨 CRITICAL ALERT: Idle workers detected in monitored zones. Please review Active Alerts.")
        
    left_col, right_col = st.columns([3, 1])
    
    with left_col:
        st.subheader("Camera Feed")
        frame = store.get_frame()
        if frame is not None:
            # OpenCV BGR to Streamlit RGB
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            st.image(frame_rgb, use_container_width=True, channels="RGB")
        else:
            st.info("Waiting for video stream... (Check if pipeline thread is running)")
            
    with right_col:
        st.subheader("Live Status")
        workers_state = store.get_workers()

        in_zone_count = store.get_in_zone_count()
        alert_count = len(active_alerts)
        
        col1, col2 = st.columns(2)
        col1.metric("Authorized Workers", in_zone_count)
        col2.metric("Active Alerts", alert_count, delta_color="inverse")
        
        st.write("---")
        st.write("**Worker Tracking**")
        
        if len(workers_state) == 0:
            st.write("No workers currently tracked.")
            
        for wid, state in workers_state.items():
            if state.status != "outside":
                status_color = "red" if state.status in ["alert", "idle"] else "green"
                st.markdown(f"<p style='color: {status_color}; font-weight: bold;'>🔸 W-{wid} : {state.status.upper()}</p>", unsafe_allow_html=True)
                if state.status == "idle" or state.status == "alert":
                    st.caption(f"⏱️ Idle for {state.idle_duration_seconds:.1f}s")
                    
        st.write("---")
        st.write("🟢 **Active**   🔴 **Idle/Alert**")

    # ── Move expander completely OUTSIDE the columns and loops ──
    st.write("---")
    with st.expander("⚙️ Edit Entry Gate"):
        st.write("Adjust gate polygon vertices (0.0 to 1.0 of frame width/height)")

        # Seed slider defaults into session_state exactly once.
        # After that, Streamlit's keyed sliders own the values — the
        # 1-second st.rerun() loop will re-render them but always read
        # from session_state, so user edits persist across reruns.
        if not st.session_state.get("_zone_initialized", False):
            source = list(store.zone_polygon)
            while len(source) < 4:
                source.append((0.0, 0.0))
            for i in range(4):
                st.session_state[f"wz_p{i}_x"] = float(source[i][0])
                st.session_state[f"wz_p{i}_y"] = float(source[i][1])
            st.session_state["_zone_initialized"] = True

        # Plain sliders (no st.form) — each keeps its value in
        # session_state[key] across the auto-rerun cycle.
        for i in range(4):
            cols = st.columns(2)
            cols[0].slider(f"P{i+1} X", 0.0, 1.0, key=f"wz_p{i}_x")
            cols[1].slider(f"P{i+1} Y", 0.0, 1.0, key=f"wz_p{i}_y")

        if st.button("✅ Apply Zone", key="apply_zone_btn"):
            new_poly = [
                (st.session_state[f"wz_p{i}_x"], st.session_state[f"wz_p{i}_y"])
                for i in range(4)
            ]
            store.zone_polygon = list(new_poly)
            st.success("✅ Zone updated and applied to detection pipeline.")
