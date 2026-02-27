"""
run_planner.py — CLI entry point for the MarEye path planner.

Called by Next.js API route via subprocess:
    python run_planner.py --input <json_file> --output <json_file>

Input JSON schema:
{
  "start":   {"lat": 18.94, "lng": 72.84},
  "goal":    {"lat": 6.83,  "lng": 93.93},
  "threat_zones": [
    {"lat": 14.0, "lon": 75.0, "radius": 150000, "threatLevel": 80}
  ],
  "vessel_speed": 18,    // knots (optional, default 18)
  "utc_hour": 14,        // optional, defaults to current UTC hour
  "month": 6             // optional, defaults to current month
}

Output JSON schema:
{
  "ok": true,
  "waypoints": [[lat, lng], ...],
  "stats": { "total_km": ..., "eta": ..., "peak_threat": ..., ... },
  "weather": { "sea_state": ..., "wave_height": ..., ... },
  "context": { "utc_hour": ..., "month": ..., "season": ... },
  "grid_shape": [rows, cols]
}
"""

import sys
import os
import json
import argparse
import datetime
import traceback

# Allow running from any working directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from detection.path_planner.config import MODEL_PATH, N_FEATURES, SEASONS
from detection.path_planner.threat_model import load_model
from detection.path_planner.cost_grid import build_cost_grid, latlon_to_cell
from detection.path_planner.astar import astar
from detection.path_planner.path_smoother import smooth_path, compute_path_stats
from detection.path_planner.weather_client import get_route_weather
from detection.path_planner.feature_builder import get_season_code
from detection.path_planner.data_generator import expert_cost   # fallback if no model


def season_name(code: int) -> str:
    for name, info in SEASONS.items():
        if info["code"] == code:
            return name.replace("_", " ").title()
    return "Unknown"


def run(input_data: dict) -> dict:
    start = input_data["start"]
    goal  = input_data["goal"]
    threat_zones = input_data.get("threat_zones", [])
    vessel_speed = float(input_data.get("vessel_speed", 18.0))

    now = datetime.datetime.utcnow()
    utc_hour = int(input_data.get("utc_hour", now.hour))
    month    = int(input_data.get("month", now.month))
    season_code = get_season_code(month)

    # ── Normalise threat zone schema (meters or km) ──────────────────────────
    for z in threat_zones:
        if "radius" in z and "radius_km" not in z:
            z["radius_km"] = z["radius"] / 1000.0
        if "lon" not in z and "lng" in z:
            z["lon"] = z["lng"]

    # ── Weather ──────────────────────────────────────────────────────────────
    weather = get_route_weather(
        start["lat"], start["lng"],
        goal["lat"],  goal["lng"],
        month=month,
    )

    # ── Build cost grid ───────────────────────────────────────────────────────
    use_model = os.path.exists(MODEL_PATH)
    if use_model:
        try:
            model = load_model(MODEL_PATH, n_features=N_FEATURES)
            cost_grid = build_cost_grid(model, threat_zones, weather, utc_hour, month)
        except Exception as e:
            print(f"[Planner] Model load failed ({e}), using expert cost fallback", file=sys.stderr)
            use_model = False

    if not use_model:
        # Fallback: build grid using expert cost function directly (no model needed)
        import numpy as np
        from detection.path_planner.config import GRID_ROWS, GRID_COLS, GRID_LAT_MIN, GRID_LAT_MAX, GRID_LNG_MIN, GRID_LNG_MAX
        from detection.path_planner.feature_builder import approximate_land as _approx_land
        lats = np.linspace(GRID_LAT_MIN, GRID_LAT_MAX, GRID_ROWS)
        lngs = np.linspace(GRID_LNG_MIN, GRID_LNG_MAX, GRID_COLS)
        cost_grid = np.zeros((GRID_ROWS, GRID_COLS), dtype=np.float32)
        for i, lat in enumerate(lats):
            for j, lng in enumerate(lngs):
                cost_grid[i, j] = expert_cost(lat, lng, threat_zones, weather, utc_hour, month)
        # Hard land mask overlay — same as cost_grid.py model path
        for i, lat in enumerate(lats):
            for j, lng in enumerate(lngs):
                if _approx_land(lat, lng) > 0.5:
                    cost_grid[i, j] = 1.0

    # ── Snap start/goal to nearest ocean cell if on land ─────────────────────
    from detection.path_planner.cost_grid import latlon_to_cell as _l2c, cell_to_latlon as _c2l

    def _snap_to_ocean(lat, lng, grid, threshold=0.985, search_radius=25):
        """Find nearest ocean cell to an inland point."""
        r, c = _l2c(lat, lng)
        if grid[r, c] < threshold:
            return lat, lng   # already ocean
        rows, cols = grid.shape
        best_dist = float('inf')
        best_pos = (lat, lng)
        for dr in range(-search_radius, search_radius + 1):
            for dc in range(-search_radius, search_radius + 1):
                nr, nc = r + dr, c + dc
                if 0 <= nr < rows and 0 <= nc < cols and grid[nr, nc] < threshold:
                    d = dr * dr + dc * dc
                    if d < best_dist:
                        best_dist = d
                        best_pos = _c2l(nr, nc)
        return best_pos

    start_ll = _snap_to_ocean(start["lat"], start["lng"], cost_grid)
    goal_ll  = _snap_to_ocean(goal["lat"],  goal["lng"],  cost_grid)

    print(f"[Planner] Start: ({start['lat']},{start['lng']}) → snapped ({start_ll[0]:.2f},{start_ll[1]:.2f})", file=sys.stderr)
    print(f"[Planner] Goal:  ({goal['lat']},{goal['lng']}) → snapped ({goal_ll[0]:.2f},{goal_ll[1]:.2f})", file=sys.stderr)

    # ── Pathfinding ───────────────────────────────────────────────────────────
    raw_path = astar(
        cost_grid,
        start_ll,
        goal_ll,
    )

    if raw_path is None:
        # Retry with wider search radius for ocean cells
        start_ll2 = _snap_to_ocean(start["lat"], start["lng"], cost_grid, search_radius=50)
        goal_ll2  = _snap_to_ocean(goal["lat"],  goal["lng"],  cost_grid, search_radius=50)
        raw_path = astar(cost_grid, start_ll2, goal_ll2)

    if raw_path is None:
        # Absolute last resort: return error, NEVER a straight line through land
        return {
            "ok": False,
            "error": "No ocean path found between the selected points. Both points may be too far inland.",
            "waypoints": [],
            "stats": {},
            "weather": weather,
            "model_used": "dyn_cost_net" if use_model else "expert_rules",
            "context": {
                "utc_hour": utc_hour, "month": month,
                "season": season_name(season_code), "season_code": season_code,
            },
            "grid_shape": [int(cost_grid.shape[0]), int(cost_grid.shape[1])],
        }

    # ── Smooth path ───────────────────────────────────────────────────────────
    smoothed = smooth_path(raw_path)

    # ── Stats ─────────────────────────────────────────────────────────────────
    stats = compute_path_stats(smoothed, cost_grid, vessel_speed_knots=vessel_speed)

    return {
        "ok": True,
        "waypoints": [[round(lat, 5), round(lng, 5)] for lat, lng in smoothed],
        "raw_waypoints": [[round(lat, 5), round(lng, 5)] for lat, lng in raw_path],
        "stats": stats,
        "weather": weather,
        "model_used": "dyn_cost_net" if use_model else "expert_rules",
        "context": {
            "utc_hour":   utc_hour,
            "month":      month,
            "season":     season_name(season_code),
            "season_code": season_code,
        },
        "grid_shape": [int(cost_grid.shape[0]), int(cost_grid.shape[1])],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input",  type=str, help="Input JSON file")
    parser.add_argument("--output", type=str, help="Output JSON file")
    parser.add_argument("--stdin",  action="store_true", help="Read input from stdin")
    args = parser.parse_args()

    try:
        if args.stdin or not args.input:
            raw = sys.stdin.read()
            input_data = json.loads(raw)
        else:
            with open(args.input) as f:
                input_data = json.load(f)

        result = run(input_data)

        out = json.dumps(result, indent=2)
        if args.output:
            with open(args.output, "w") as f:
                f.write(out)
        else:
            print(out)

    except Exception as e:
        error_result = {
            "ok": False,
            "error": str(e),
            "traceback": traceback.format_exc(),
        }
        print(json.dumps(error_result), file=sys.stdout)
        sys.exit(1)


if __name__ == "__main__":
    main()
