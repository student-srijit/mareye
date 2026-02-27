"""
weather_client.py — Fetch real-time weather for the Indian Ocean region.

Uses Open-Meteo Marine API (free, no API key needed):
  - Significant wave height
  - Wind speed + direction at 10m
  - Weather code (visibility proxy)

Also computes Douglas sea scale from wave height.
Falls back to seasonal averages if the API is unavailable.
"""

import math
import urllib.request
import urllib.error
import json
import datetime
from typing import Dict, Tuple, Optional

from .config import SEASON_SEA_STATE
from .feature_builder import get_season_code


# ── Douglas Sea Scale from wave height ───────────────────────────────────────

def wave_to_sea_scale(wave_height_m: float) -> float:
    thresholds = [(0.0, 0), (0.1, 1), (0.5, 2), (1.25, 3), (2.5, 4), (4.0, 5), (6.0, 6)]
    for i in range(len(thresholds) - 1, -1, -1):
        if wave_height_m >= thresholds[i][0]:
            return float(thresholds[i][1])
    return 0.0


# ── Open-Meteo Marine API ─────────────────────────────────────────────────────

def fetch_open_meteo_marine(lat: float, lng: float) -> Optional[Dict]:
    """
    Fetch current marine conditions from Open-Meteo (free, no key).
    Returns dict with sea_state, wave_height, wind_speed, visibility.
    """
    url = (
        f"https://marine-api.open-meteo.com/v1/marine"
        f"?latitude={lat}&longitude={lng}"
        f"&current=wave_height,wind_wave_height,wind_wave_direction"
        f"&hourly=wave_height,wind_wave_period"
        f"&timezone=UTC"
        f"&forecast_days=1"
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "MarEye/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())

        current = data.get("current", {})
        wave_h = float(current.get("wave_height", 1.0) or 1.0)
        sea_state = wave_to_sea_scale(wave_h)

        # Wind from Open-Meteo global forecast
        wind_url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lng}"
            f"&current=wind_speed_10m,visibility,weather_code"
            f"&timezone=UTC"
        )
        try:
            req2 = urllib.request.Request(wind_url, headers={"User-Agent": "MarEye/1.0"})
            with urllib.request.urlopen(req2, timeout=5) as resp2:
                wdata = json.loads(resp2.read().decode())
            wcurrent = wdata.get("current", {})
            wind_ms  = float(wcurrent.get("wind_speed_10m", 10.0) or 10.0)
            wind_kts = wind_ms * 1.944
            vis_m    = float(wcurrent.get("visibility", 15000) or 15000)
            vis_km   = min(vis_m / 1000.0, 25.0)
        except Exception:
            wind_kts = wave_h * 8.0
            vis_km = max(3.0, 20.0 - sea_state * 2.5)

        return {
            "sea_state":   sea_state,
            "wave_height": round(wave_h, 2),
            "wind_speed":  round(wind_kts, 1),
            "visibility":  round(vis_km, 1),
            "source":      "open-meteo-live",
        }

    except Exception as e:
        return None


# ── Seasonal fallback ─────────────────────────────────────────────────────────

def seasonal_fallback(lat: float, lng: float, month: int) -> Dict:
    """
    Return climatological averages when live fetch fails.
    Based on Indian Meteorological Department ocean atlas data.
    """
    season_code = get_season_code(month)
    sm = SEASON_SEA_STATE[season_code]

    # Region
    if lng < 78:
        base_sea = sm["arabian"]
    else:
        base_sea = sm["bay_of_bengal"]

    wave_h = base_sea * 0.9
    wind_kts = base_sea * 8.5
    vis_km = max(3.0, 20.0 - base_sea * 1.8)

    return {
        "sea_state":   round(base_sea, 1),
        "wave_height": round(wave_h, 2),
        "wind_speed":  round(wind_kts, 1),
        "visibility":  round(vis_km, 1),
        "source":      "seasonal-climatology",
    }


# ── Combined multi-point weather for a route ─────────────────────────────────

def get_route_weather(
    start_lat: float, start_lng: float,
    goal_lat: float,  goal_lng: float,
    month: Optional[int] = None,
) -> Dict:
    """
    Fetch weather at the midpoint of the route.
    Falls back to seasonal if live fetch fails.
    """
    if month is None:
        month = datetime.datetime.utcnow().month

    mid_lat = (start_lat + goal_lat) / 2
    mid_lng = (start_lng + goal_lng) / 2

    live = fetch_open_meteo_marine(mid_lat, mid_lng)
    if live:
        return live

    return seasonal_fallback(mid_lat, mid_lng, month)
