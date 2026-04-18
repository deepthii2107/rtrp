"""
Shared State repository.
Thread-safe shared memory between the background pipeline and the Streamlit UI.
"""
import threading
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
    in_zone_count: int = 0
    authorized_count: int = 0  # Number of gate-authorized workers currently tracked

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
