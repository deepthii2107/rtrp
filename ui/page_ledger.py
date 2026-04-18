"""
Page 3 — Worker Ledger
Full accountability table of all detected workers.
"""
import streamlit as st
import pandas as pd
import time

from state.session_store import SessionStore

def render() -> None:
    st.header("👥 Worker Ledger")
    
    store: SessionStore = st.session_state.store
    workers = store.get_workers()
    
    total_detected = len(workers)
    currently_authorized = sum(1 for w in workers.values() if w.status != "outside")
    currently_alerting = sum(1 for w in workers.values() if w.alert_triggered)
    
    col1, col2, col3 = st.columns(3)
    col1.metric("Total Detected", total_detected)
    col2.metric("Authorized Workers", currently_authorized)
    col3.metric("Currently Alerting", currently_alerting, delta_color="inverse")
    
    st.write("---")
    
    if total_detected > 0:
        data = []
        for wid, state in workers.items():
            data.append({
                "Worker ID": wid,
                "Status": state.status.upper(),
                "Authorized": state.status != "outside",
                "Time in Shop (s)": round(state.total_time_in_shop, 1),
                "Idle Duration (s)": round(state.idle_duration_seconds, 1),
                "Movement Score": round(state.movement_score, 2),
                "First Seen": pd.to_datetime(state.first_seen, unit='s').strftime("%H:%M:%S")
            })
            
        df = pd.DataFrame(data)
        
        # Color coding function for Pandas Stylor
        def color_status(val):
            color = 'black'
            if val == 'ACTIVE':
                color = 'green'
            elif val == 'IDLE':
                color = 'orange'
            elif val == 'ALERT':
                color = 'red'
            return f'color: {color}'
            
        st.dataframe(df.style.map(color_status, subset=['Status']), use_container_width=True)
        
        csv = df.to_csv(index=False).encode('utf-8')
        st.download_button(
            label="Download Ledger as CSV",
            data=csv,
            file_name=f"worker_ledger_{int(time.time())}.csv",
            mime="text/csv",
        )
    else:
        st.info("No workers have been detected yet.")
