"""
path_smoother.py — Smooth raw A* waypoints into a navigable path.

Steps:
1. Ramer-Douglas-Peucker simplification (remove redundant A* grid points)
2. Catmull-Rom spline interpolation (smooth curve, no overshooting)
3. Resample to evenly-spaced waypoints (~40km apart)
4. Compute per-waypoint metadata (cost, risk label, estimated time)
"""

import math
import numpy as np
from typing import List, Tuple, Dict, Any, Optional

from .feature_builder import haversine_km
from .astar import remove_colinear_waypoints


EARTH_R_KM = 6371.0
NM_PER_KM  = 0.539957
RESAMPLE_INTERVAL_KM = 40.0   # evenly space waypoints every ~40km


def catmull_rom_chain(points: List[Tuple[float, float]], n_interp: int = 8) -> List[Tuple[float, float]]:
    """
    Catmull-Rom spline interpolation through all points.
    n_interp: number of interpolated points between each pair.
    """
    if len(points) < 4:
        return points

    result = [points[0]]

    # Extend with phantom end-points for boundary conditions
    pts = [
        (2*points[0][0] - points[1][0], 2*points[0][1] - points[1][1]),
        *points,
        (2*points[-1][0] - points[-2][0], 2*points[-1][1] - points[-2][1]),
    ]

    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i-1], pts[i], pts[i+1], pts[i+2]
        for j in range(1, n_interp + 1):
            t = j / n_interp
            t2, t3 = t*t, t*t*t
            lat = 0.5 * (
                (2*p1[0]) +
                (-p0[0] + p2[0]) * t +
                (2*p0[0] - 5*p1[0] + 4*p2[0] - p3[0]) * t2 +
                (-p0[0] + 3*p1[0] - 3*p2[0] + p3[0]) * t3
            )
            lng = 0.5 * (
                (2*p1[1]) +
                (-p0[1] + p2[1]) * t +
                (2*p0[1] - 5*p1[1] + 4*p2[1] - p3[1]) * t2 +
                (-p0[1] + 3*p1[1] - 3*p2[1] + p3[1]) * t3
            )
            result.append((lat, lng))

    result.append(points[-1])
    return result


def resample_path(waypoints: List[Tuple[float, float]], interval_km: float = RESAMPLE_INTERVAL_KM) -> List[Tuple[float, float]]:
    """Resample path to evenly-spaced points ~interval_km apart."""
    if len(waypoints) < 2:
        return waypoints

    resampled = [waypoints[0]]
    accumulated = 0.0

    for i in range(1, len(waypoints)):
        seg_dist = haversine_km(*waypoints[i-1], *waypoints[i])
        accumulated += seg_dist
        if accumulated >= interval_km:
            resampled.append(waypoints[i])
            accumulated = 0.0

    if resampled[-1] != waypoints[-1]:
        resampled.append(waypoints[-1])

    return resampled


def compute_path_stats(
    waypoints: List[Tuple[float, float]],
    cost_grid: Optional[np.ndarray],
    vessel_speed_knots: float = 18.0,
    grid_bounds: Optional[Tuple] = None,
) -> Dict[str, Any]:
    """
    Compute distance, ETA, threat exposure, and risk segments.

    Returns rich metadata for UI display.
    """
    from .cost_grid import latlon_to_cell

    total_km = 0.0
    max_cost = 0.0
    risk_segments = []

    for i in range(1, len(waypoints)):
        seg_km = haversine_km(*waypoints[i-1], *waypoints[i])
        total_km += seg_km

        if cost_grid is not None:
            # Sample cost at midpoint of segment
            mid_lat = (waypoints[i-1][0] + waypoints[i][0]) / 2
            mid_lng = (waypoints[i-1][1] + waypoints[i][1]) / 2
            r, c = latlon_to_cell(mid_lat, mid_lng)
            seg_cost = float(cost_grid[r, c])
            max_cost = max(max_cost, seg_cost)

            risk_label = (
                "CRITICAL" if seg_cost > 0.70 else
                "HIGH"     if seg_cost > 0.45 else
                "MODERATE" if seg_cost > 0.25 else
                "LOW"
            )
            risk_segments.append({
                "from": [waypoints[i-1][0], waypoints[i-1][1]],
                "to":   [waypoints[i][0],   waypoints[i][1]],
                "cost": round(seg_cost, 3),
                "risk": risk_label,
                "dist_km": round(seg_km, 1),
            })

    total_nm = total_km * NM_PER_KM
    hours = total_nm / vessel_speed_knots
    eta_h = int(hours)
    eta_m = int((hours - eta_h) * 60)

    return {
        "total_km":        round(total_km, 1),
        "total_nm":        round(total_nm, 1),
        "eta":             f"{eta_h}h {eta_m}m",
        "eta_hours":       round(hours, 2),
        "peak_threat":     round(max_cost, 3),
        "threat_exposure": _risk_label(max_cost),
        "risk_segments":   risk_segments,
    }


def _risk_label(cost: float) -> str:
    if cost > 0.70: return "CRITICAL"
    if cost > 0.45: return "HIGH"
    if cost > 0.25: return "MODERATE"
    return "LOW"


def smooth_path(
    raw_waypoints: List[Tuple[float, float]],
    simplify_tolerance: float = 0.4,
    resample_km: float = RESAMPLE_INTERVAL_KM,
) -> List[Tuple[float, float]]:
    """
    Full pipeline: simplify → smooth → resample.
    """
    # Step 1: RDP simplification
    simplified = remove_colinear_waypoints(raw_waypoints, tolerance_deg=simplify_tolerance)

    # Step 2: Catmull-Rom smoothing
    if len(simplified) >= 4:
        smoothed = catmull_rom_chain(simplified, n_interp=6)
    else:
        smoothed = simplified

    # Step 3: Resample
    resampled = resample_path(smoothed, interval_km=resample_km)

    return resampled
