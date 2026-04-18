"""
Manage and analyze regions of interest.
Determines if a worker's centroid is within the configured Work Zone.
"""
from typing import List, Tuple
import numpy as np
import cv2

class ZoneManager:
    """Manages the active area and provides point-in-zone checking."""

    def __init__(self, polygon_fractions: List[Tuple[float, float]]) -> None:
        """
        Args:
            polygon_fractions: List of (x_frac, y_frac) tuples (0.0 - 1.0).
        """
        self.polygon_fractions = polygon_fractions

    def set_polygon(self, polygon_fractions: List[Tuple[float, float]]) -> None:
        """Updates the zone polygon with new fractional coordinates."""
        self.polygon_fractions = polygon_fractions

    def point_in_zone(self, cx: int, cy: int, frame_w: int, frame_h: int) -> bool:
        """
        Ray-casting algorithm to determine if a point is inside the polygon.
        
        Args:
            cx, cy: Point coordinates in pixels.
            frame_w, frame_h: Frame dimensions to scale the polygon fractions.
            
        Returns:
            True if the point represents a worker inside the zone.
        """
        n = len(self.polygon_fractions)
        if n < 3:
            return False

        # Scale fractions to pixels
        poly_px = [(int(x * frame_w), int(y * frame_h)) for x, y in self.polygon_fractions]

        inside = False
        p1x, p1y = poly_px[0]
        for i in range(1, n + 1):
            p2x, p2y = poly_px[i % n]
            # Check edge intersection
            if cy > min(p1y, p2y):
                if cy <= max(p1y, p2y):
                    if cx <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (cy - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or cx <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y

        return inside

    def bbox_touches_zone(self, x1: int, y1: int, x2: int, y2: int,
                          frame_w: int, frame_h: int) -> bool:
        """
        Returns True if the bounding box overlaps the gate polygon at all.

        Covers all overlap cases:
          1. Any of the 4 bbox corners is inside the polygon
          2. The bbox centroid is inside the polygon
          3. Any polygon vertex falls inside the bbox rectangle
             (handles small gate polygons fully enclosed by large bbox)

        Args:
            x1, y1: Top-left corner of bbox in pixels.
            x2, y2: Bottom-right corner of bbox in pixels.
            frame_w, frame_h: Frame dimensions to scale polygon fractions.

        Returns:
            True if any part of the bbox overlaps the gate polygon.
        """
        if len(self.polygon_fractions) < 3:
            return False

        # 1 & 2: Check 4 corners + centroid of bbox against polygon
        test_points = [
            (x1, y1), (x2, y1), (x1, y2), (x2, y2),
            ((x1 + x2) // 2, (y1 + y2) // 2),
        ]
        for px, py in test_points:
            if self.point_in_zone(px, py, frame_w, frame_h):
                return True

        # 3: Check if any polygon vertex falls inside the bbox rectangle
        poly_px = [
            (int(fx * frame_w), int(fy * frame_h))
            for fx, fy in self.polygon_fractions
        ]
        for vx, vy in poly_px:
            if x1 <= vx <= x2 and y1 <= vy <= y2:
                return True

        return False

    def draw_zone(self, frame: np.ndarray, color: Tuple[int, int, int], alpha: float = 0.25) -> np.ndarray:
        """
        Draw a semi-transparent filled polygon + border on the frame.
        
        Args:
            frame: Image array to draw on.
            color: BGR tuple for the zone color.
            alpha: Transparency factor (0.0 to 1.0).
        """
        frame_h, frame_w = frame.shape[:2]
        
        # Scale to pixels
        pts = np.array([[int(x * frame_w), int(y * frame_h)] for x, y in self.polygon_fractions], np.int32)
        pts = pts.reshape((-1, 1, 2))

        # Draw filled semi-transparent overlay
        overlay = frame.copy()
        cv2.fillPoly(overlay, [pts], color)
        # Blend overlay
        cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)
        # Draw border
        cv2.polylines(frame, [pts], isClosed=True, color=color, thickness=2, lineType=cv2.LINE_4)
        
        return frame
