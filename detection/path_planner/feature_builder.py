"""
feature_builder.py — Builds a 32-dimensional feature vector for any (lat, lng, context).

Feature vector layout (32 dims):
  [0]  lat_norm             — normalized latitude
  [1]  lng_norm             — normalized longitude
  [2]  dist_nearest_km_n    — distance to nearest active threat zone (norm)
  [3]  nearest_threat_lvl   — threat level of nearest zone (0–1 mapped from 0–100%)
  [4..15]  dist_zone_0..11  — distance to each of up to 12 zones (norm, 0-pad if fewer)
  [16] sea_state_n          — Douglas sea scale 0–6 normalized
  [17] wave_height_n        — wave height metres normalized (0–8m)
  [18] wind_speed_n         — wind speed knots normalized (0–60)
  [19] visibility_n         — visibility km normalized (0–20)
  [20] is_night             — binary: 0/1
  [21] hour_sin             — sin(2π * hour / 24)
  [22] hour_cos             — cos(2π * hour / 24)
  [23] season_sin           — sin(2π * season_code / 4)
  [24] season_cos           — cos(2π * season_code / 4)
  [25] dist_nearest_base_n  — distance to nearest friendly naval base (norm)
  [26] in_shipping_lane     — binary: 0/1
  [27] in_chokepoint        — binary: 0/1 (within 80km of any chokepoint)
  [28] in_eez               — approximate EEZ flag (India's EEZ ±200nm)
  [29] is_land              — binary: approximate land mask
  [30] threat_density       — sum of active threat contributions in 300km radius
  [31] seasonal_sea_mult    — seasonal sea-state multiplier for this region (norm)
"""

import math
import datetime
from typing import List, Dict, Any

import numpy as np

from .config import (
    GRID_LAT_MIN, GRID_LAT_MAX, GRID_LNG_MIN, GRID_LNG_MAX,
    CHOKEPOINTS, NAVAL_BASES, SHIPPING_LANE_BOXES, LAND_APPROXIMATE_BOXES,
    SEASONS, SEASON_SEA_STATE, NIGHT_HOURS, N_STATIC_ZONES,
)

# ── Utility functions ──────────────────────────────────────────────────────────

def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two points in kilometres."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def get_season_code(month: int) -> int:
    for name, info in SEASONS.items():
        if month in info["months"]:
            return info["code"]
    return 0


# ── Coastline polygons for land detection ──────────────────────────────────
# Simplified but accurate coastline polygons (point-in-polygon ray casting)
# Covers: Indian subcontinent, Sri Lanka, Arabian Peninsula, SE Asia/Myanmar

_INDIA_POLYGON = [
    # West coast (south to north along coast), then east coast (north to south)
    # This traces India's coastline as a closed polygon
    ( 8.08, 77.55),  # Kanyakumari
    ( 8.35, 76.90),  # Trivandrum
    ( 9.95, 76.25),  # Kochi
    (10.75, 75.95),  # Kozhikode
    (12.00, 75.15),  # Mangalore
    (13.00, 74.75),  # Karwar
    (14.45, 74.40),  # Gokarna
    (15.40, 73.80),  # Goa
    (16.90, 73.30),  # Ratnagiri
    (18.95, 72.82),  # Mumbai
    (20.90, 70.35),  # Porbandar
    (21.65, 69.60),  # Somnath
    (22.30, 68.95),  # Mandvi
    (23.00, 68.35),  # Kutch south
    (23.85, 68.50),  # Kutch north
    (23.90, 69.25),  # Rann of Kutch E
    (24.20, 70.50),  # Thar desert edge
    (25.50, 71.40),  # Rajasthan border
    (27.00, 70.50),  # Pakistan border W
    (28.50, 70.20),  # NW frontier
    (30.00, 72.00),  # Punjab
    (30.50, 74.00),  # Punjab east
    (30.00, 77.00),  # Himachal
    (28.50, 80.50),  # UP/Nepal border
    (27.00, 84.00),  # Bihar
    (26.50, 88.00),  # WB/Bangladesh
    (25.00, 89.00),  # Bangladesh border
    (24.00, 89.50),  # Bangladesh
    (23.50, 89.00),  # Bangladesh S
    (22.50, 88.80),  # Kolkata
    (21.50, 87.50),  # Odisha NE
    (20.80, 87.00),  # Paradip
    (19.80, 85.80),  # Puri
    (17.70, 83.30),  # Visakhapatnam
    (16.50, 82.20),  # Godavari
    (15.90, 80.60),  # Krishna
    (14.70, 80.15),  # Nellore
    (13.05, 80.25),  # Chennai
    (12.60, 80.20),  # Mahabalipuram
    (11.75, 79.75),  # Pondicherry
    (10.75, 79.85),  # Nagapattinam
    ( 9.28, 79.15),  # Rameswaram
    ( 8.08, 77.55),  # Back to Kanyakumari
]

_SRI_LANKA_POLYGON = [
    ( 9.80, 80.20),  # Jaffna
    ( 9.65, 79.85),  # Point Pedro W
    ( 8.55, 79.70),  # Puttalam
    ( 7.85, 79.85),  # Negombo
    ( 6.95, 79.85),  # Colombo
    ( 5.92, 80.55),  # Matara (southernmost)
    ( 6.25, 81.20),  # Hambantota
    ( 7.20, 81.85),  # Batticaloa
    ( 8.60, 81.20),  # Trincomalee
    ( 9.50, 80.40),  # Mullaitivu
    ( 9.80, 80.20),
]

_ARABIAN_PENINSULA_POLYGON = [
    # Simplified — just the south/SE coast that matters for routing
    (12.50, 43.20),  # Djibouti
    (14.00, 42.50),  # Yemen north coast
    (15.50, 42.80),  # Red Sea coast
    (18.00, 41.50),  # Saudi west
    (22.00, 39.00),  # Saudi NW
    (25.00, 37.00),  # Upper Red Sea
    (28.00, 34.50),  # Suez
    (30.00, 32.50),  # Egypt/Sinai
    (30.00, 48.00),  # Kuwait
    (27.00, 50.00),  # Bahrain/Qatar
    (24.50, 51.50),  # UAE
    (22.00, 55.00),  # Oman NE
    (22.80, 59.80),  # Oman Muscat corner
    (20.50, 58.80),  # Oman SE
    (17.00, 55.00),  # Oman south
    (15.50, 52.00),  # Yemen/Oman border
    (14.60, 49.00),  # Yemen S
    (12.60, 45.00),  # Gulf of Aden N coast
    (12.50, 43.20),  # Close
]

_MYANMAR_POLYGON = [
    # Western coast of Myanmar that affects Bay of Bengal routes
    (20.00, 92.50),  # Sittwe area
    (18.50, 94.30),  # Ayeyarwady delta
    (16.50, 96.20),  # Yangon
    (14.00, 97.80),  # Dawei
    (12.00, 98.50),  # Myeik
    (10.00, 98.60),  # Kawthaung
    (10.00, 99.00),  # Thailand border
    (13.00, 99.50),  # Thailand coast
    (14.00, 99.80),  # Thailand W
    (16.00, 98.50),  # Myanmar interior
    (18.00, 97.00),  # Myanmar interior
    (20.00, 96.00),  # Myanmar interior
    (22.00, 94.50),  # Myanmar N
    (21.50, 92.00),  # Chittagong
    (20.00, 92.50),
]

_SOMALIA_POLYGON = [
    # Horn of Africa east coast
    (11.50, 43.10),  # Djibouti S
    (10.50, 45.00),  # Berbera
    (11.80, 50.40),  # Tip of Horn
    ( 9.50, 50.20),  # Hafun
    ( 5.00, 46.00),  # Mogadishu area
    ( 1.00, 41.50),  # S Somalia
    (-1.00, 41.00),  # Kenya border
    (-1.00, 43.00),  # Interior
    ( 5.00, 43.00),  # Interior
    ( 9.00, 43.50),  # Interior
    (11.50, 43.10),
]

_SUMATRA_POLYGON = [
    # West coast of Sumatra/Malay Peninsula affecting our grid
    ( 5.50, 95.30),  # Banda Aceh
    ( 3.50, 98.50),  # Medan coast
    ( 0.90, 103.50), # East Sumatra
    (-2.00, 105.00), # S Sumatra
    (-5.50, 105.50), # Sunda Strait
    (-5.50, 104.00), # SW coast
    (-3.50, 101.50), # Bengkulu
    (-0.50, 99.00),  # Padang
    ( 2.50, 96.50),  # W Aceh
    ( 5.50, 95.30),
]

_ALL_LAND_POLYGONS = [
    _INDIA_POLYGON,
    _SRI_LANKA_POLYGON,
    _ARABIAN_PENINSULA_POLYGON,
    _MYANMAR_POLYGON,
    _SOMALIA_POLYGON,
    _SUMATRA_POLYGON,
]

def _point_in_polygon(lat: float, lng: float, polygon: list) -> bool:
    """Ray-casting algorithm for point-in-polygon test."""
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        yi, xi = polygon[i]
        yj, xj = polygon[j]
        if ((yi > lat) != (yj > lat)) and (lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def approximate_land(lat: float, lng: float) -> float:
    """Returns 1.0 if point is approximately over land, 0.0 otherwise.
    Uses polygon-based coastline detection with ray casting."""
    for polygon in _ALL_LAND_POLYGONS:
        if _point_in_polygon(lat, lng, polygon):
            return 1.0
    return 0.0


def in_india_eez(lat: float, lng: float) -> float:
    """Approximate check if within India's 200nm EEZ."""
    # India's coast spans roughly 8–23°N, 68–80°E coast
    coast_points = [
        (23.0, 68.0), (22.0, 69.5), (20.0, 70.5), (18.0, 72.8),
        (15.0, 73.8), (12.0, 75.0), (9.5, 76.5), (8.0, 77.5),
        (9.0, 79.5), (11.0, 80.5), (13.5, 80.3), (15.5, 80.2),
        (17.5, 82.5), (20.0, 86.5), (21.0, 87.0), (22.0, 88.5),
    ]
    EEZ_DIST_KM = 370.0  # 200 nautical miles
    for clat, clng in coast_points:
        if haversine_km(lat, lng, clat, clng) < EEZ_DIST_KM:
            return 1.0
    return 0.0


def in_shipping_lane(lat: float, lng: float) -> float:
    for box in SHIPPING_LANE_BOXES:
        if box[0] <= lat <= box[1] and box[2] <= lng <= box[3]:
            return 1.0
    return 0.0


def in_chokepoint(lat: float, lng: float) -> float:
    for cp in CHOKEPOINTS:
        if haversine_km(lat, lng, cp["lat"], cp["lng"]) < cp["radius_km"] + 80:
            return 1.0
    return 0.0


def seasonal_sea_multiplier(lat: float, lng: float, season_code: int) -> float:
    """Returns normalised sea-state multiplier for this region/season."""
    sm = SEASON_SEA_STATE[season_code]
    # Arabian Sea: lng < 78
    if lng < 78:
        raw = sm["arabian"]
    else:
        raw = sm["bay_of_bengal"]
    return raw / 6.0   # normalize against max Douglas scale


# ── Main feature builder ───────────────────────────────────────────────────────

def build_features(
    lat: float,
    lng: float,
    threat_zones: List[Dict[str, Any]],
    weather: Dict[str, float],
    utc_hour: int,
    month: int,
) -> np.ndarray:
    """
    Build the 32-dimensional feature vector for a single grid cell.

    Parameters
    ----------
    lat, lng       : geographic coordinates
    threat_zones   : list of {"lat", "lon", "radius_km", "threatLevel"} dicts
    weather        : {"sea_state": 0-6, "wave_height": m, "wind_speed": knots, "visibility": km}
    utc_hour       : UTC hour (0–23)
    month          : calendar month (1–12)
    """
    feat = np.zeros(32, dtype=np.float32)

    # [0][1] Position
    feat[0] = (lat - GRID_LAT_MIN) / (GRID_LAT_MAX - GRID_LAT_MIN)
    feat[1] = (lng - GRID_LNG_MIN) / (GRID_LNG_MAX - GRID_LNG_MIN)

    # [2][3] Nearest threat zone
    MAX_DIST_NORM = 2000.0  # km
    nearest_dist = MAX_DIST_NORM
    nearest_level = 0.0
    if threat_zones:
        for z in threat_zones:
            d = haversine_km(lat, lng, z["lat"], z.get("lon", z.get("lng", 0.0)))
            r = z.get("radius_km", z.get("radius", 120000) / 1000.0)  # support meters or km
            effective_d = max(0.0, d - r)   # actual "entry distance"
            if effective_d < nearest_dist:
                nearest_dist = effective_d
                nearest_level = z.get("threatLevel", z.get("level", 50)) / 100.0
    feat[2] = min(nearest_dist / MAX_DIST_NORM, 1.0)
    feat[3] = nearest_level

    # [4..15] Per-zone distances (padded with 1.0 if fewer than N_STATIC_ZONES)
    sorted_zones = sorted(
        threat_zones,
        key=lambda z: haversine_km(lat, lng, z["lat"], z.get("lon", z.get("lng", 0.0)))
    )[:N_STATIC_ZONES]

    for i in range(N_STATIC_ZONES):
        if i < len(sorted_zones):
            z = sorted_zones[i]
            d = haversine_km(lat, lng, z["lat"], z.get("lon", z.get("lng", 0.0)))
            r = z.get("radius_km", z.get("radius", 120000) / 1000.0)
            feat[4 + i] = min(max(0.0, d - r) / MAX_DIST_NORM, 1.0)
        else:
            feat[4 + i] = 1.0   # no threat = max distance (low cost)

    # [16][17][18][19] Weather
    feat[16] = weather.get("sea_state", 1.0) / 6.0
    feat[17] = min(weather.get("wave_height", 0.5) / 8.0, 1.0)
    feat[18] = min(weather.get("wind_speed", 10.0) / 60.0, 1.0)
    feat[19] = 1.0 - min(weather.get("visibility", 15.0) / 20.0, 1.0)  # invert: low vis = high cost

    # [20][21][22] Time of day
    is_night = 1.0 if utc_hour in NIGHT_HOURS else 0.0
    feat[20] = is_night
    feat[21] = math.sin(2 * math.pi * utc_hour / 24.0)
    feat[22] = math.cos(2 * math.pi * utc_hour / 24.0)

    # [23][24] Season
    season_code = get_season_code(month)
    feat[23] = math.sin(2 * math.pi * season_code / 4.0)
    feat[24] = math.cos(2 * math.pi * season_code / 4.0)

    # [25] Nearest naval base
    if NAVAL_BASES:
        min_base_dist = min(haversine_km(lat, lng, b["lat"], b["lng"]) for b in NAVAL_BASES)
        feat[25] = min(min_base_dist / 3000.0, 1.0)

    # [26] Shipping lane
    feat[26] = in_shipping_lane(lat, lng)

    # [27] Chokepoint
    feat[27] = in_chokepoint(lat, lng)

    # [28] EEZ
    feat[28] = in_india_eez(lat, lng)

    # [29] Land mask
    feat[29] = approximate_land(lat, lng)

    # [30] Threat density — aggregate pressure within 400km
    density = 0.0
    for z in threat_zones:
        d = haversine_km(lat, lng, z["lat"], z.get("lon", z.get("lng", 0.0)))
        lvl = z.get("threatLevel", 50) / 100.0
        r = z.get("radius_km", 120.0)
        # Gaussian falloff
        sigma = r * 1.5
        density += lvl * math.exp(-(d ** 2) / (2 * sigma ** 2))
    feat[30] = min(density, 1.0)

    # [31] Seasonal sea-state multiplier
    feat[31] = seasonal_sea_multiplier(lat, lng, season_code)

    return feat


def build_features_batch(
    coords: np.ndarray,           # (N, 2) lat/lng pairs
    threat_zones: List[Dict],
    weather: Dict,
    utc_hour: int,
    month: int,
) -> np.ndarray:
    """Vectorised batch feature construction."""
    N = len(coords)
    features = np.zeros((N, 32), dtype=np.float32)
    for i, (lat, lng) in enumerate(coords):
        features[i] = build_features(lat, lng, threat_zones, weather, utc_hour, month)
    return features
