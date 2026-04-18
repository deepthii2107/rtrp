"""
Business logic to classify and monitor worker states.
Manages the Active, Idle, and Alert state transitions.
"""
from dataclasses import dataclass, field
from collections import deque
from typing import Dict, Set, Optional, Deque
import time
import logging

try:
    from engine.pose_analyser import MovementSample, PoseAnalyser
except ImportError:
    pass

logger = logging.getLogger(__name__)

@dataclass
class WorkerState:
    """Represents the real-time calculated state of a single worker."""
    worker_id: int
    status: str = "outside"                 # "outside" | "active" | "idle" | "alert"
    in_zone: bool = False
    zone_entry_time: Optional[float] = None
    last_active_time: Optional[float] = None
    idle_duration_seconds: float = 0.0
    pose_history: Deque = field(default_factory=deque) # deque of MovementSample
    movement_score: float = 0.0
    total_time_in_shop: float = 0.0
    first_seen: float = field(default_factory=time.time)
    alert_triggered: bool = False

class ActivityClassifier:
    """Manages the state transitions for all workers over time."""

    def __init__(self, movement_window_size: int = 5) -> None:
        self.workers: Dict[int, WorkerState] = {}
        self.movement_window_size = movement_window_size

    def get_or_create(self, worker_id: int) -> WorkerState:
        """Retrieves an existing state or creates a new default one."""
        if worker_id not in self.workers:
            state = WorkerState(worker_id=worker_id)
            state.pose_history = deque(maxlen=self.movement_window_size)
            self.workers[worker_id] = state
            logger.debug(f"Created new WorkerState for ID: {worker_id}")
        return self.workers[worker_id]

    def update(
        self,
        worker_id: int,
        in_zone: bool,
        pose_sample: Optional['MovementSample'],
        now: float,
        movement_threshold: float,
        idle_timeout_seconds: float,
        centroid_displacement: float = 0.0,
    ) -> WorkerState:
        """
        Updates the worker's state according to the state machine rules.

        Args:
            centroid_displacement: Pixel distance the worker's centroid moved
                                   since the last frame. Used as the primary
                                   movement signal when pose_sample is None.
        """
        state = self.get_or_create(worker_id)
        state.total_time_in_shop = now - state.first_seen

        # Update Zone Entry
        if in_zone and not state.in_zone:
            state.zone_entry_time = now
            # Assume active when just entering
            state.last_active_time = now
            state.status = "active"
            state.alert_triggered = False

        state.in_zone = in_zone

        if not in_zone:
            state.status = "outside"
            state.zone_entry_time = None
            state.last_active_time = None
            state.idle_duration_seconds = 0.0
            state.movement_score = 0.0
            state.alert_triggered = False
            return state

        # In Zone logic
        if pose_sample is not None:
            state.pose_history.append(pose_sample)

            if len(state.pose_history) >= 2:
                # Compute rolling average movement score across window
                scores = []
                history_list = list(state.pose_history)
                for i in range(1, len(history_list)):
                    score = PoseAnalyser.compute_movement_score(history_list[i-1], history_list[i])
                    scores.append(score)
                state.movement_score = sum(scores) / len(scores)

                if state.movement_score > movement_threshold:
                    state.status = "active"
                    state.last_active_time = now
                    state.idle_duration_seconds = 0.0
                    state.alert_triggered = False
                else:
                    if state.last_active_time is None:
                        state.last_active_time = state.zone_entry_time or now

                    state.idle_duration_seconds = max(0.0, now - state.last_active_time)

                    if state.idle_duration_seconds > idle_timeout_seconds:
                        state.status = "alert"
                        state.alert_triggered = True
                    else:
                        state.status = "idle"
                        state.alert_triggered = False

        else:
            # --- Movement-based activity classification (centroid displacement) ---
            # centroid_displacement > 0 only when we have a previous centroid to
            # compare against. On the very first frame it will be 0.0, which is
            # treated as "not moving" — the worker starts as active (zone entry
            # sets status = "active" above) and gets a grace period equal to
            # the full idle_timeout before alert fires.
            if centroid_displacement > movement_threshold:
                state.status = "active"
                state.last_active_time = now
                state.idle_duration_seconds = 0.0
                state.alert_triggered = False
            else:
                if state.last_active_time is None:
                    state.last_active_time = state.zone_entry_time or now

                state.idle_duration_seconds = max(0.0, now - state.last_active_time)

                if state.idle_duration_seconds > idle_timeout_seconds:
                    state.status = "alert"
                    state.alert_triggered = True
                elif state.idle_duration_seconds > 0:
                    state.status = "idle"
                    state.alert_triggered = False
                # else: keep "active" (just entered zone / displacement unavailable)

        return state

    def purge_missing(self, active_ids: Set[int]) -> None:
        """Removes disconnected IDs from state tracking."""
        missing = set(self.workers.keys()) - active_ids
        for wid in missing:
            logger.debug(f"Purging state for Worker {wid}")
            del self.workers[wid]

    @property
    def all_workers(self) -> Dict[int, WorkerState]:
        """Provides access to the internal dict."""
        return self.workers
