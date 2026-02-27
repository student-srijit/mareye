"""
data_generator.py — Synthetic training data for DynCostNet.

Generates (feature_vector, ground_truth_cost) pairs using expert-designed
cost rules that define what "good" traversal cost looks like across
all combinations of threats, weather, time, and season.

The model learns to reproduce this cost function — and since the expert
rules encode real tactical logic, the learned model generalises correctly.

Training pairs: ~200,000 samples covering the full Indian Ocean grid.
"""

import math
import random
import numpy as np
from typing import List, Tuple, Dict

from .config import (
    GRID_LAT_MIN, GRID_LAT_MAX, GRID_LNG_MIN, GRID_LNG_MAX,
    GRID_ROWS, GRID_COLS, COST_WEIGHTS, NIGHT_HOURS, NIGHT_STEALTH_BONUS,
    SEASONS,
)
from .feature_builder import (
    build_features, haversine_km, approximate_land,
    in_chokepoint, seasonal_sea_multiplier, get_season_code,
)


# ── Expert cost function (ground truth) ───────────────────────────────────────

def expert_cost(
    lat: float,
    lng: float,
    threat_zones: List[Dict],
    weather: Dict,
    utc_hour: int,
    month: int,
) -> float:
    """
    Expert-designed cost function — ground truth for training.
    Returns cost ∈ [0.0, 1.0].

    Rules encode real naval tactical doctrine:
    - Hard block land
    - Threat zones repel with Gaussian falloff
    - Sea state degrades maneuverability/stealth exponentially
    - Night provides stealth bonus (lower detection cost)
    - Chokepoints raise ambush cost
    - SW Monsoon Arabian Sea is operationally constrained
    """
    # ── Hard land block ──
    if approximate_land(lat, lng) > 0.5:
        return 1.0   # impassable — submarines cannot traverse land

    base = COST_WEIGHTS["base_ocean"]

    # ── Threat zone contribution ──
    threat_cost = 0.0
    for z in threat_zones:
        d_km = haversine_km(lat, lng, z["lat"], z.get("lon", z.get("lng", 0.0)))
        r_km = z.get("radius_km", z.get("radius", 120000) / 1000.0)
        lvl = z.get("threatLevel", 50) / 100.0  # 0–1

        # Inside zone: very high cost
        if d_km < r_km:
            penetration = 1.0 - (d_km / r_km)   # 0 at edge, 1 at centre
            zone_cost = lvl * (0.4 + 0.5 * penetration)
        else:
            # Gaussian falloff outside zone (approach caution)
            sigma = r_km * 0.8
            zone_cost = lvl * 0.3 * math.exp(-(d_km - r_km) ** 2 / (2 * sigma ** 2))

        threat_cost += zone_cost

    threat_cost = min(threat_cost * COST_WEIGHTS["threat"], COST_WEIGHTS["threat"])

    # ── Sea state contribution ──
    sea_state = weather.get("sea_state", 1.5)
    # Exponential above scale 4 (operational limit)
    if sea_state <= 3:
        sea_cost = (sea_state / 3.0) * 0.08
    elif sea_state <= 5:
        sea_cost = 0.08 + ((sea_state - 3) / 2.0) * 0.15
    else:
        sea_cost = 0.30   # scale 6: extreme — near-abort cost
    sea_cost *= COST_WEIGHTS["sea_state"]

    # ── Weather contribution ──
    vis = weather.get("visibility", 15.0)
    wind = weather.get("wind_speed", 10.0)
    wx_cost = (max(0.0, 1.0 - vis / 15.0) * 0.4 + min(wind / 50.0, 1.0) * 0.3) * COST_WEIGHTS["weather"]

    # ── Night stealth factor ──
    if utc_hour in NIGHT_HOURS:
        night_adj = -NIGHT_STEALTH_BONUS * COST_WEIGHTS["night_stealth"]  # bonus = cost reduction
    else:
        night_adj = 0.0

    # ── Chokepoint cost ──
    choke_cost = in_chokepoint(lat, lng) * COST_WEIGHTS["chokepoint"]

    # ── Seasonal sea-state multiplier ──
    season_code = get_season_code(month)
    ssm = seasonal_sea_multiplier(lat, lng, season_code)
    seasonal_boost = ssm * 0.08  # moderate seasonal uplift

    total = base + threat_cost + sea_cost + wx_cost + night_adj + choke_cost + seasonal_boost
    return float(min(max(total, 0.0), 0.98))


# ── Random scenario generator ──────────────────────────────────────────────────

def random_threat_zones(n: int = 8) -> List[Dict]:
    """Generate n random threat zones in the grid area."""
    zones = []
    for _ in range(n):
        lat = random.uniform(GRID_LAT_MIN, GRID_LAT_MAX)
        lng = random.uniform(GRID_LNG_MIN, GRID_LNG_MAX)
        level = random.uniform(10, 100)
        radius_km = random.uniform(80, 350)
        zones.append({
            "lat": lat, "lon": lng,
            "radius_km": radius_km,
            "threatLevel": level,
        })
    return zones


def random_weather(season_code: int) -> Dict:
    """Generate realistic weather for a given season."""
    # Season-realistic sea state ranges
    sea_state_ranges = {
        0: (0.5, 2.5),   # NE Monsoon: calm
        1: (1.0, 3.5),   # Pre-monsoon: moderate
        2: (2.5, 5.5),   # SW Monsoon: rough
        3: (1.5, 3.5),   # Post-monsoon: moderate
    }
    lo, hi = sea_state_ranges.get(season_code, (1.0, 3.0))
    sea_state = random.uniform(lo, hi)
    wave_h = sea_state * 0.9 * random.uniform(0.8, 1.2)
    wind = sea_state * 8.0 * random.uniform(0.7, 1.3)
    vis = max(2.0, 20.0 - sea_state * 2.5 + random.gauss(0, 2))
    return {
        "sea_state": sea_state,
        "wave_height": wave_h,
        "wind_speed": min(wind, 60.0),
        "visibility": min(vis, 25.0),
    }


def generate_dataset(n_samples: int = 200_000, verbose: bool = True) -> Tuple[np.ndarray, np.ndarray]:
    """
    Generate (X, y) training dataset.

    X : (n_samples, 32)  — feature vectors
    y : (n_samples,)     — expert cost values
    """
    X_list = []
    y_list = []

    lat_range = np.linspace(GRID_LAT_MIN, GRID_LAT_MAX, GRID_ROWS)
    lng_range = np.linspace(GRID_LNG_MIN, GRID_LNG_MAX, GRID_COLS)

    all_coords = [(lat, lng) for lat in lat_range for lng in lng_range]
    random.shuffle(all_coords)

    # Progress milestones
    milestones = set(range(0, n_samples, n_samples // 20))

    i = 0
    while i < n_samples:
        # New scenario every batch_size samples
        batch_size = random.randint(50, 250)
        month = random.randint(1, 12)
        season_code = get_season_code(month)
        utc_hour = random.randint(0, 23)
        n_zones = random.randint(2, 12)
        zones = random_threat_zones(n_zones)
        weather = random_weather(season_code)

        for _ in range(batch_size):
            if i >= n_samples:
                break
            lat, lng = all_coords[i % len(all_coords)]
            # Add slight jitter so we're not just on grid nodes
            lat += random.gauss(0, 0.1)
            lng += random.gauss(0, 0.1)
            lat = float(np.clip(lat, GRID_LAT_MIN, GRID_LAT_MAX))
            lng = float(np.clip(lng, GRID_LNG_MIN, GRID_LNG_MAX))

            feat = build_features(lat, lng, zones, weather, utc_hour, month)
            cost = expert_cost(lat, lng, zones, weather, utc_hour, month)

            X_list.append(feat)
            y_list.append(cost)

            if verbose and i in milestones:
                pct = 100 * i / n_samples
                print(f"  Generating data... {pct:.0f}% ({i:,}/{n_samples:,})", flush=True)
            i += 1

    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list, dtype=np.float32)
    print(f"  Dataset ready: X={X.shape}, y={y.shape}, cost range [{y.min():.3f}, {y.max():.3f}]")
    return X, y
