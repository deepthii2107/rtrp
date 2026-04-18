"""
Page 2 — Active Alerts
Surfaces urgent idle alerts with maximum clarity.
"""
import streamlit as st
import pandas as pd

from state.session_store import SessionStore

def render() -> None:
    st.header("⚠️ Active Alerts")
    
    store: SessionStore = st.session_state.store
    alerts = store.get_alerts()
    active_alerts = [a for a in alerts if not a.get("resolved", False)]
    
    if len(active_alerts) == 0:
        st.success("✅ All Clear. No workers are currently idling.")
    else:
        st.markdown(
            "<h3 style='color: red;'><span style='animation: pulse 1.5s infinite;'>🔴</span> ACTION REQUIRED</h3>",
            unsafe_allow_html=True
        )
        
        for idx, alert in enumerate(active_alerts):
            with st.container():
                st.error(f"**WORKER {alert['worker_id']} is idle!**")
                
                # Fetch current worker state to see live exact duration if still tracked
                workers = store.get_workers()
                w_state = workers.get(alert['worker_id'])
                current_idle = w_state.idle_duration_seconds if w_state else alert['idle_duration']
                
                st.write(f"- Duration: **{current_idle:.1f} seconds**")
                st.write(f"- Zone: Work Zone Alpha")
                
                if st.button("Mark as Resolved", key=f"resolve_{idx}_{alert['timestamp']}"):
                    with store._lock:
                        # Find the actual alert dict in the log by timestamp matching
                        for a in store.alert_log:
                            if a['timestamp'] == alert['timestamp'] and a['worker_id'] == alert['worker_id']:
                                a['resolved'] = True
                                break
                    st.rerun()
                    
    st.write("---")
    st.subheader("Alert History")
    
    if len(alerts) > 0:
        df = pd.DataFrame(alerts)
        # Format the timestamp
        df['time'] = pd.to_datetime(df['timestamp'], unit='s')
        df = df[['time', 'worker_id', 'idle_duration', 'resolved']]
        df = df.sort_values(by="time", ascending=False)
        st.dataframe(df, use_container_width=True)
    else:
        st.info("No alerts logged in this session.")
