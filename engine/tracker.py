"""
Centroid Tracker assignment.
Assigns and tracks stable Worker IDs across frames using Euclidean distance.
"""
import logging
from typing import List, Dict, Tuple, Any
import math

logger = logging.getLogger(__name__)

class CentroidTracker:
    """Assigns stable IDs to detected bounding boxes via nearest centroid tracking."""

    def __init__(self, max_disappeared: int) -> None:
        """
        Args:
            max_disappeared: Number of consecutive frames an object must be missed
                             before its ID is deregistered.
        """
        self.max_disappeared = max_disappeared
        self.next_worker_id = 1
        self.objects: Dict[int, Dict[str, Any]] = {}  # {worker_id: {"centroid": (x,y), "bbox": (x1,y1,x2,y2), "disappeared": int}}

    def register(self, centroid: Tuple[int, int], bbox: Tuple[int, int, int, int], keypoints: dict) -> None:
        """Registers a new worker with a unique ID."""
        self.objects[self.next_worker_id] = {
            "centroid": centroid,
            "bbox": bbox,
            "keypoints": keypoints,
            "disappeared": 0
        }
        self.next_worker_id += 1

    def deregister(self, worker_id: int) -> None:
        """Removes a worker from tracking."""
        if worker_id in self.objects:
            del self.objects[worker_id]

    def update(self, detections: List[Dict[str, Any]]) -> Dict[int, Dict[str, Any]]:
        """
        Updates tracked objects with new detections.
        
        Args:
            detections: List of detection dicts (from PersonDetector).
        
        Returns:
            Dictionary mapping worker_id to object state (centroid, bbox, disappeared).
        """
        # If no detections, increment disappeared count for all tracked objects.
        if len(detections) == 0:
            for worker_id in list(self.objects.keys()):
                self.objects[worker_id]["disappeared"] += 1
                if self.objects[worker_id]["disappeared"] > self.max_disappeared:
                    self.deregister(worker_id)
            return self.objects

        # Compute centroids for new detections.
        input_centroids = []
        input_bboxes = []
        input_keypoints = []
        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            cx = int((x1 + x2) / 2.0)
            cy = int((y1 + y2) / 2.0)
            input_centroids.append((cx, cy))
            input_bboxes.append((x1, y1, x2, y2))
            input_keypoints.append(det.get("keypoints", {}))

        # If currently tracking zero objects, register everyone.
        if len(self.objects) == 0:
            for i in range(len(input_centroids)):
                self.register(input_centroids[i], input_bboxes[i], input_keypoints[i])
            return self.objects

        # Compute nearest neighbor assignments.
        # We manually compute euclidean distance matrix to avoid scipy dependency.
        object_ids = list(self.objects.keys())
        object_centroids = [self.objects[oid]["centroid"] for oid in object_ids]

        distances = []
        for oc in object_centroids:
            row = []
            for ic in input_centroids:
                dist = math.hypot(oc[0] - ic[0], oc[1] - ic[1])
                row.append(dist)
            distances.append(row)

        # Simple greedy matching
        used_rows = set()
        used_cols = set()

        # Iterate over sorted distances
        # List of (distance, row_index, col_index)
        flat_distances = []
        for r in range(len(distances)):
            for c in range(len(distances[r])):
                flat_distances.append((distances[r][c], r, c))
        
        flat_distances.sort(key=lambda x: x[0])

        for dist, r, c in flat_distances:
            if r in used_rows or c in used_cols:
                continue
            
            # Match found
            object_id = object_ids[r]
            self.objects[object_id]["centroid"] = input_centroids[c]
            self.objects[object_id]["bbox"] = input_bboxes[c]
            self.objects[object_id]["keypoints"] = input_keypoints[c]
            self.objects[object_id]["disappeared"] = 0
            
            used_rows.add(r)
            used_cols.add(c)

        # Handle unmatched existing objects
        unmatched_rows = set(range(len(object_centroids))) - used_rows
        for r in unmatched_rows:
            object_id = object_ids[r]
            self.objects[object_id]["disappeared"] += 1
            if self.objects[object_id]["disappeared"] > self.max_disappeared:
                self.deregister(object_id)

        # Handle unmatched new detections
        unmatched_cols = set(range(len(input_centroids))) - used_cols
        for c in unmatched_cols:
            self.register(input_centroids[c], input_bboxes[c], input_keypoints[c])

        return self.objects
