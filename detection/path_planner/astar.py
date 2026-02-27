"""
astar.py — A* pathfinding on a 2D cost grid.

The A* implementation uses the trained DynCostNet cost values as edge weights.
It finds the minimum-cost path from a start cell to a goal cell, where
cost represents threat exposure, sea state, and tactical risk.

Neighbours: 8-directional movement (including diagonals).
Heuristic: scaled Euclidean with gear-down factor for threat-heavy regions.
"""

import heapq
import math
import numpy as np
from typing import List, Tuple, Optional

from .config import GRID_ROWS, GRID_COLS
from .cost_grid import cell_to_latlon, latlon_to_cell
from .feature_builder import haversine_km


# Diagonal movement cost multiplier (√2 for diagonal cells)
DIAG = math.sqrt(2)

# Movement directions: (drow, dcol, base_multiplier)
NEIGHBOURS = [
    (-1,  0, 1.0),   # N
    ( 1,  0, 1.0),   # S
    ( 0, -1, 1.0),   # W
    ( 0,  1, 1.0),   # E
    (-1, -1, DIAG),  # NW
    (-1,  1, DIAG),  # NE
    ( 1, -1, DIAG),  # SW
    ( 1,  1, DIAG),  # SE
]


def _heuristic(r1: int, c1: int, r2: int, c2: int, grid_cost: float) -> float:
    """
    Admissible heuristic: Euclidean distance * base_cell_cost.
    Scaled by average grid cost to keep search focused.
    """
    dr = r2 - r1
    dc = c2 - c1
    return math.sqrt(dr * dr + dc * dc) * max(0.05, grid_cost * 0.4)


def astar(
    cost_grid: np.ndarray,
    start_latlon: Tuple[float, float],
    goal_latlon: Tuple[float, float],
    max_cost_threshold: float = 0.96,
    land_cost_threshold: float = 0.985,
) -> Optional[List[Tuple[float, float]]]:
    """
    A* pathfinding on the cost grid.

    Parameters
    ----------
    cost_grid           : (GRID_ROWS, GRID_COLS) — model-predicted costs
    start_latlon        : (lat, lng) of start point
    goal_latlon         : (lat, lng) of target point
    max_cost_threshold  : cells above this cost are treated as impassable
    land_cost_threshold : cells above this are treated as land (hard block)

    Returns
    -------
    List of (lat, lng) waypoints from start to goal, or None if no path found.
    """
    rows, cols = cost_grid.shape
    sr, sc = latlon_to_cell(*start_latlon)
    gr, gc = latlon_to_cell(*goal_latlon)

    if sr == gr and sc == gc:
        return [start_latlon, goal_latlon]

    # Pre-compute mean cost for heuristic scaling
    reachable_mask = cost_grid < land_cost_threshold
    mean_cost = float(cost_grid[reachable_mask].mean()) if reachable_mask.any() else 0.1

    # Priority queue: (f_score, g_score, row, col)
    open_heap: List[Tuple[float, float, int, int]] = []
    g_score = np.full((rows, cols), np.inf, dtype=np.float32)
    came_from = np.full((rows, cols, 2), -1, dtype=np.int32)

    g_score[sr, sc] = 0.0
    h = _heuristic(sr, sc, gr, gc, mean_cost)
    heapq.heappush(open_heap, (h, 0.0, sr, sc))

    closed = np.zeros((rows, cols), dtype=bool)

    while open_heap:
        f, g, r, c = heapq.heappop(open_heap)

        if closed[r, c]:
            continue
        closed[r, c] = True

        if r == gr and c == gc:
            # Reconstruct path
            path_cells = []
            cur_r, cur_c = gr, gc
            while not (cur_r == sr and cur_c == sc):
                path_cells.append((cur_r, cur_c))
                pr, pc = came_from[cur_r, cur_c]
                cur_r, cur_c = pr, pc
            path_cells.append((sr, sc))
            path_cells.reverse()

            # Convert cells back to lat/lng
            waypoints = [cell_to_latlon(r_, c_) for r_, c_ in path_cells]
            return waypoints

        for dr, dc, move_mult in NEIGHBOURS:
            nr, nc = r + dr, c + dc
            if not (0 <= nr < rows and 0 <= nc < cols):
                continue
            if closed[nr, nc]:
                continue

            cell_cost = float(cost_grid[nr, nc])

            # Hard block on land / extreme threat
            if cell_cost >= land_cost_threshold:
                continue

            # Soft penalty for high-cost cells (threat zones)
            if cell_cost > max_cost_threshold:
                cell_cost = max_cost_threshold

            # Edge cost = cell cost * movement distance
            edge_cost = cell_cost * move_mult + 0.01  # 0.01 base step cost

            new_g = g + edge_cost

            if new_g < g_score[nr, nc]:
                g_score[nr, nc] = new_g
                came_from[nr, nc] = [r, c]
                h = _heuristic(nr, nc, gr, gc, mean_cost)
                heapq.heappush(open_heap, (new_g + h, new_g, nr, nc))

    return None   # No path found


def remove_colinear_waypoints(waypoints: List[Tuple[float, float]], tolerance_deg: float = 0.6) -> List[Tuple[float, float]]:
    """Ramer-Douglas-Peucker simplification of waypoints."""
    if len(waypoints) <= 2:
        return waypoints

    def perp_distance(point, line_start, line_end):
        x0, y0 = point
        x1, y1 = line_start
        x2, y2 = line_end
        dx, dy = x2 - x1, y2 - y1
        denom = math.sqrt(dx*dx + dy*dy)
        if denom == 0:
            return math.sqrt((x0-x1)**2 + (y0-y1)**2)
        return abs(dy*x0 - dx*y0 + x2*y1 - y2*x1) / denom

    def rdp(pts, eps):
        if len(pts) <= 2:
            return pts
        max_d, max_i = 0.0, 0
        for i in range(1, len(pts) - 1):
            d = perp_distance(pts[i], pts[0], pts[-1])
            if d > max_d:
                max_d, max_i = d, i
        if max_d > eps:
            left  = rdp(pts[:max_i+1], eps)
            right = rdp(pts[max_i:], eps)
            return left[:-1] + right
        return [pts[0], pts[-1]]

    return rdp(waypoints, tolerance_deg)
