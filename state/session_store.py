"""
Shared State repository.
Thread-safe shared memory between the background pipeline and the Streamlit UI.
"""
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import numpy as np

@dataclass
class SessionStore:
    _lock: threading.RLock = field(default_factory=threading.RLock)

    latest_frame: Optional[np.ndarray] = None
    worker_states: Dict[int, Any] = field(default_factory=dict)  # {id: WorkerState}
    alert_log: List[Dict[str, Any]] = field(default_factory=list) # list of alert event dicts
    is_pipeline_running: bool = False
    pipeline_error: Optional[str] = None
    current_video_path: Optional[str] = None
    in_zone_count: int = 0
    authorized_count: int = 0  # Number of gate-authorized workers currently tracked
    latest_fps: float = 0.0
    telemetry_history: List[Dict[str, Any]] = field(default_factory=list)
    _last_telemetry_sample_at: float = 0.0

    # Settings (writable from UI)
    movement_threshold: float = 8.0
    idle_timeout_seconds: float = 120.0  # 2 minutes — matches DEFAULT_IDLE_TIMEOUT_SECONDS
    detection_confidence: float = 0.25
    zone_polygon: List[tuple[float, float]] = field(default_factory=list)

    def update_frame(self, frame: np.ndarray) -> None:
        """Safely update the latest processed frame."""
        with self._lock:
            self.latest_frame = frame

    def get_frame(self) -> Optional[np.ndarray]:
        """Safely retrieve the latest processed frame."""
        with self._lock:
            return self.latest_frame.copy() if self.latest_frame is not None else None

    def update_workers(self, states: Dict[int, Any]) -> None:
        """Safely update the worker states dictionary."""
        with self._lock:
            # We copy states to prevent RuntimeError when the UI thread reads it
            self.worker_states = dict(states)

    def get_workers(self) -> Dict[int, Any]:
        """Safely retrieve the worker states dictionary."""
        with self._lock:
            # Return a shallow copy of the dict to allow robust iteration without locking
            return dict(self.worker_states)

    def add_alert(self, alert: Dict[str, Any]) -> None:
        """Safely add a new alert to the alert log."""
        with self._lock:
            self.alert_log.append(alert)

    def get_alerts(self) -> List[Dict[str, Any]]:
        """Safely retrieve all alerts."""
        with self._lock:
            return list(self.alert_log)

    def get_active_alerts(self) -> List[Dict[str, Any]]:
        """Safely retrieve only unresolved active alerts."""
        with self._lock:
            return [a for a in self.alert_log if not a.get("resolved", False)]

    def set_in_zone_count(self, count: int) -> None:
        """Safely update the number of workers currently inside the zone."""
        with self._lock:
            self.in_zone_count = count

    def get_in_zone_count(self) -> int:
        """Safely retrieve the number of workers currently inside the zone."""
        with self._lock:
            return self.in_zone_count

    def set_latest_fps(self, fps: float) -> None:
        with self._lock:
            self.latest_fps = float(fps or 0.0)

    def get_latest_fps(self) -> float:
        with self._lock:
            return float(self.latest_fps or 0.0)

    def serialize_workers(self) -> List[Dict[str, Any]]:
        with self._lock:
            workers = []
            for worker_id, state in self.worker_states.items():
                workers.append({
                    "worker_id": worker_id,
                    "status": getattr(state, "status", "outside"),
                    "in_zone": bool(getattr(state, "in_zone", False)),
                    "idle_duration_seconds": float(getattr(state, "idle_duration_seconds", 0.0) or 0.0),
                    "movement_score": float(getattr(state, "movement_score", 0.0) or 0.0),
                    "total_time_in_shop": float(getattr(state, "total_time_in_shop", 0.0) or 0.0),
                    "first_seen": float(getattr(state, "first_seen", 0.0) or 0.0),
                    "last_active_time": float(getattr(state, "last_active_time", 0.0) or 0.0) if getattr(state, "last_active_time", None) else None,
                    "alert_triggered": bool(getattr(state, "alert_triggered", False)),
                })
            return workers

    def get_alert_history(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self.alert_log)

    def record_telemetry_snapshot(self, timestamp: Optional[float] = None, min_interval_seconds: float = 1.0) -> None:
        now = float(timestamp or time.time())
        with self._lock:
            if self._last_telemetry_sample_at and (now - self._last_telemetry_sample_at) < min_interval_seconds:
                return

            workers = list(self.worker_states.values())
            active_count = sum(1 for worker in workers if getattr(worker, "status", "") == "active")
            idle_count = sum(1 for worker in workers if getattr(worker, "status", "") == "idle")
            alert_count = sum(1 for worker in workers if getattr(worker, "status", "") == "alert")
            occupied_count = sum(1 for worker in workers if getattr(worker, "status", "") != "outside")
            productive_count = active_count
            non_outside_count = active_count + idle_count + alert_count
            productivity = round((productive_count / non_outside_count) * 100) if non_outside_count else 0

            self.telemetry_history.append({
                "timestamp": now,
                "occupied_count": occupied_count,
                "active_count": active_count,
                "idle_count": idle_count,
                "alert_count": alert_count,
                "productivity": productivity,
                "fps": float(self.latest_fps or 0.0),
                "pipeline_running": bool(self.is_pipeline_running),
            })
            self.telemetry_history = self.telemetry_history[-120:]
            self._last_telemetry_sample_at = now

    def get_telemetry_history(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self.telemetry_history)

    def build_analytics_snapshot(self, server_start_time: float) -> Dict[str, Any]:
        now = time.time()
        with self._lock:
            workers = self.serialize_workers()
            active_alerts = [alert for alert in self.alert_log if not alert.get("resolved", False)]
            alert_history = list(self.alert_log)
            active_count = sum(1 for worker in workers if worker["status"] == "active")
            idle_count = sum(1 for worker in workers if worker["status"] == "idle")
            alerting_count = sum(1 for worker in workers if worker["status"] == "alert")
            occupied_count = sum(1 for worker in workers if worker["status"] != "outside")
            total_workers = len(workers)
            total_tracked_seconds = sum(worker["total_time_in_shop"] for worker in workers)
            total_idle_seconds = sum(worker["idle_duration_seconds"] for worker in workers)
            productivity = round((active_count / occupied_count) * 100) if occupied_count else 0
            avg_movement_score = round(
                sum(worker["movement_score"] for worker in workers) / total_workers, 2
            ) if total_workers else 0.0
            avg_idle_seconds = round(total_idle_seconds / occupied_count, 2) if occupied_count else 0.0

            return {
                "generated_at": now,
                "system": {
                    "online": True,
                    "pipeline_running": bool(self.is_pipeline_running),
                    "uptime_seconds": now - server_start_time,
                    "start_time": server_start_time,
                    "latest_fps": float(self.latest_fps or 0.0),
                },
                "workers": workers,
                "alerts": {
                    "active": active_alerts,
                    "history": alert_history,
                    "active_count": len(active_alerts),
                    "history_count": len(alert_history),
                },
                "current": {
                    "total_workers": total_workers,
                    "occupied_count": occupied_count,
                    "active_count": active_count,
                    "idle_count": idle_count,
                    "alerting_count": alerting_count,
                    "productivity": productivity,
                    "total_tracked_seconds": total_tracked_seconds,
                    "total_idle_seconds": total_idle_seconds,
                    "avg_movement_score": avg_movement_score,
                    "avg_idle_seconds": avg_idle_seconds,
                    "authorized_count": int(self.authorized_count),
                    "in_zone_count": int(self.in_zone_count),
                },
                "history": list(self.telemetry_history),
            }
