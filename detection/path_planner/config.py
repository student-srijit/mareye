"""
config.py — Geographic grid, feature definitions, and cost weights
for the MarEye Dynamic Cost Network path planner.
"""

# ── Grid Definition ──────────────────────────────────────────────────────────
# Covers Indian Ocean, Arabian Sea, Bay of Bengal, Western Pacific approach
GRID_LAT_MIN = -5.0
GRID_LAT_MAX = 30.0
GRID_LNG_MIN = 55.0
GRID_LNG_MAX = 100.0
GRID_ROWS = 140          # ~0.25° per cell ≈ 27.5 km per cell
GRID_COLS = 180          # ~0.25° per cell

# Convenience aliases used by notebooks / visualization
LAT_MIN = GRID_LAT_MIN
LAT_MAX = GRID_LAT_MAX
LON_MIN = GRID_LNG_MIN
LON_MAX = GRID_LNG_MAX

# ── Feature Dimensions ───────────────────────────────────────────────────────
N_STATIC_ZONES = 12      # max threat zones baked into features
N_FEATURES = 32          # total input feature size for DynCostNet

# ── Maritime Chokepoints (real lat/lng) ──────────────────────────────────────
CHOKEPOINTS = [
    {"name": "Hormuz",      "lat": 26.60, "lng": 56.50, "radius_km": 50},
    {"name": "Bab-el-Mandeb","lat": 12.63, "lng": 43.15, "radius_km": 60},
    {"name": "Malacca",     "lat":  2.50, "lng": 101.40, "radius_km": 40},
    {"name": "Palk Strait", "lat":  9.20, "lng":  79.80, "radius_km": 30},
    {"name": "Eight Degree", "lat": 8.00, "lng":  73.00, "radius_km": 50},
    {"name": "Nine Degree",  "lat": 9.00, "lng":  72.50, "radius_km": 50},
]

# ── Key Naval Bases ──────────────────────────────────────────────────────────
NAVAL_BASES = [
    {"name": "Mumbai WNC",  "lat": 18.94, "lng": 72.84},
    {"name": "Karwar",      "lat": 14.82, "lng": 74.12},
    {"name": "Vizag ENC",   "lat": 17.70, "lng": 83.30},
    {"name": "Kochi SNC",   "lat":  9.97, "lng": 76.27},
    {"name": "Port Blair",  "lat": 11.67, "lng": 92.73},
    {"name": "Campbell Bay","lat":  6.83, "lng": 93.93},
]

# ── Approximate Shipping Lanes (bounding boxes) ──────────────────────────────
SHIPPING_LANE_BOXES = [
    # (lat_min, lat_max, lng_min, lng_max)
    ( 0,  4,  98, 104),   # Malacca approach
    ( 5, 12,  70,  90),   # India west-east
    (12, 26,  56,  65),   # Gulf to India
    ( 5, 15,  40,  60),   # Suez-India route
    (20, 28,  55,  72),   # Arabian Sea north
]

# ── Land Mask (rough rectangles to penalise — full mask comes from grid) ─────
# Used during training data generation only; actual mask uses lat/lng heuristic
LAND_APPROXIMATE_BOXES = [
    # (lat_min, lat_max, lng_min, lng_max) — major land masses in our region
    ( 8, 30,  68,  96),   # Indian subcontinent
    (22, 30,  96, 100),   # Myanmar/Bangladesh/Thailand
    (24, 30, 100, 106),   # Southeast Asia
    (20, 30,  56,  65),   # Arabian Peninsula core
    ( 0, 20,  95, 106),   # Malay Peninsula + Sumatra
]

# ── Seasonal Definitions ─────────────────────────────────────────────────────
# Indian Ocean seasons — affects weather, detection, sea state
SEASONS = {
    "NE_MONSOON":    {"months": [11, 12, 1, 2],  "code": 0},  # Winter — calmer
    "PRE_MONSOON":   {"months": [3, 4, 5],        "code": 1},  # Hot, haze
    "SW_MONSOON":    {"months": [6, 7, 8, 9],     "code": 2},  # Rough seas
    "POST_MONSOON":  {"months": [10],              "code": 3},  # Transition
}

# Seasonal sea-state amplifiers per region (Arabian Sea / BoB)
SEASON_SEA_STATE = {
    0: {"arabian": 1.0, "bay_of_bengal": 2.5},   # NE monsoon: rough BoB
    1: {"arabian": 1.5, "bay_of_bengal": 1.5},   # Pre-monsoon: moderate
    2: {"arabian": 4.5, "bay_of_bengal": 3.0},   # SW monsoon: very rough Arabian Sea
    3: {"arabian": 2.0, "bay_of_bengal": 2.0},   # Post-monsoon: moderate
}

# ── Cost Weights ─────────────────────────────────────────────────────────────
COST_WEIGHTS = {
    "threat":       0.45,   # threat zone avoidance (highest priority)
    "sea_state":    0.20,   # sea roughness affecting stealth/speed
    "weather":      0.10,   # visibility, wind
    "night_stealth":0.08,   # night = lower visibility = tactical advantage
    "land_penalty": 0.999,  # impassable
    "chokepoint":   0.12,   # narrow bottlenecks — ambush risk
    "base_ocean":   0.05,   # baseline traversal cost
}

# ── Night Tactical Factor ─────────────────────────────────────────────────────
# Night operations reduce radar/optical detection probability
NIGHT_STEALTH_BONUS = 0.15   # reduce cost by this during night ops
NIGHT_HOURS = list(range(20, 24)) + list(range(0, 6))  # 2000–0600 local

# ── Douglas Sea Scale (wave height m → scale 0–6) ────────────────────────────
SEA_SCALE = [
    (0.0,  0),  # 0: Glassy
    (0.1,  1),  # 1: Rippled
    (0.5,  2),  # 2: Wavelets
    (1.25, 3),  # 3: Slight
    (2.50, 4),  # 4: Moderate — operational limit for small craft
    (4.00, 5),  # 5: Rough — reduced effectiveness
    (6.00, 6),  # 6: Very rough — abort threshold
]

# ── Model Paths ──────────────────────────────────────────────────────────────
import os
_HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(_HERE, "dyn_cost_net.pt")
