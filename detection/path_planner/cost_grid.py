"""
cost_grid.py — Builds a traversal cost grid over the Indian Ocean region
using the trained DynCostNet model.

The grid is a 2D numpy array of shape (GRID_ROWS, GRID_COLS).
Each cell holds the model-predicted traversal cost ∈ [0, 1].
A* uses this grid as edge weights.

Grid coordinates:
  row i → lat = GRID_LAT_MIN + i * (lat_range / GRID_ROWS)
  col j → lng = GRID_LNG_MIN + j * (lng_range / GRID_COLS)
"""

import numpy as np
import torch
from typing import List, Dict, Tuple

from .config import (
    GRID_LAT_MIN, GRID_LAT_MAX, GRID_LNG_MIN, GRID_LNG_MAX,
    GRID_ROWS, GRID_COLS, N_FEATURES, MODEL_PATH,
)
from .feature_builder import build_features_batch, approximate_land
from .threat_model import DynCostNet, load_model


# Cell size in degrees
CELL_LAT = (GRID_LAT_MAX - GRID_LAT_MIN) / GRID_ROWS
CELL_LNG = (GRID_LNG_MAX - GRID_LNG_MIN) / GRID_COLS


def latlon_to_cell(lat: float, lng: float) -> Tuple[int, int]:
    """Convert (lat, lng) → (row, col). Clamps to valid range."""
    row = int((lat - GRID_LAT_MIN) / CELL_LAT)
    col = int((lng - GRID_LNG_MIN) / CELL_LNG)
    row = max(0, min(row, GRID_ROWS - 1))
    col = max(0, min(col, GRID_COLS - 1))
    return row, col


def cell_to_latlon(row: int, col: int) -> Tuple[float, float]:
    """Convert (row, col) → (lat, lng) at cell centre."""
    lat = GRID_LAT_MIN + (row + 0.5) * CELL_LAT
    lng = GRID_LNG_MIN + (col + 0.5) * CELL_LNG
    return lat, lng


def build_cost_grid(
    model: DynCostNet,
    threat_zones: List[Dict],
    weather: Dict,
    utc_hour: int,
    month: int,
    batch_size: int = 4096,
    device: str = "cpu",
) -> np.ndarray:
    """
    Build a (GRID_ROWS, GRID_COLS) cost grid using the model.

    Returns numpy array of float32 costs ∈ [0, 1].
    """
    model.eval()

    # All grid cell centres as (lat, lng)
    lats = np.linspace(GRID_LAT_MIN + CELL_LAT/2, GRID_LAT_MAX - CELL_LAT/2, GRID_ROWS)
    lngs = np.linspace(GRID_LNG_MIN + CELL_LNG/2, GRID_LNG_MAX - CELL_LNG/2, GRID_COLS)
    grid_lat, grid_lng = np.meshgrid(lats, lngs, indexing="ij")  # (ROWS, COLS)

    all_coords = np.stack([grid_lat.ravel(), grid_lng.ravel()], axis=1)  # (N, 2)
    N = len(all_coords)
    costs = np.zeros(N, dtype=np.float32)

    # Process in batches to avoid OOM
    for start in range(0, N, batch_size):
        end = min(start + batch_size, N)
        batch_coords = all_coords[start:end]
        feats = build_features_batch(batch_coords, threat_zones, weather, utc_hour, month)
        feats_t = torch.from_numpy(feats).to(device)
        with torch.no_grad():
            c = model(feats_t).cpu().numpy().flatten()
        costs[start:end] = c

    grid = costs.reshape(GRID_ROWS, GRID_COLS)

    # ── Hard land mask override ──────────────────────────────────────────────
    # Force land cells to cost = 1.0 regardless of model prediction.
    # This ensures A* NEVER routes through land.
    lats_arr = np.linspace(GRID_LAT_MIN + CELL_LAT/2, GRID_LAT_MAX - CELL_LAT/2, GRID_ROWS)
    lngs_arr = np.linspace(GRID_LNG_MIN + CELL_LNG/2, GRID_LNG_MAX - CELL_LNG/2, GRID_COLS)
    for i in range(GRID_ROWS):
        for j in range(GRID_COLS):
            if approximate_land(lats_arr[i], lngs_arr[j]) > 0.5:
                grid[i, j] = 1.0

    return grid


def load_and_build_grid(
    threat_zones: List[Dict],
    weather: Dict,
    utc_hour: int,
    month: int,
    model_path: str = MODEL_PATH,
) -> Tuple[np.ndarray, DynCostNet]:
    """Convenience: load model and build cost grid in one call."""
    model = load_model(model_path, n_features=N_FEATURES)
    grid = build_cost_grid(model, threat_zones, weather, utc_hour, month)
    return grid, model
