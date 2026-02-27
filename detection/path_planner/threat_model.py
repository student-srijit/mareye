"""
threat_model.py — Dynamic Cost Neural Network (DynCostNet)

Architecture:
  Input: 32 multi-context features per grid cell
  Output: traversal cost ∈ (0, 1)
    0.0 = free ocean, no threats, perfect weather
    1.0 = impassable (land / critical threat zone centre)

Why this beats simple distance-to-threat:
  - Accounts for time-of-day (night = stealth advantage)
  - Accounts for season (SW Monsoon → Arabian Sea cost spikes)
  - Accounts for live weather (sea state, visibility)
  - Learned nonlinear interactions (e.g. high threat + rough seas = exponential cost)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class DynCostNet(nn.Module):
    """
    Multi-factor Dynamic Cost Neural Network.

    Input  : (batch, N_FEATURES=32) — see feature_builder.py for full spec
    Output : (batch, 1) — traversal cost in [0, 1]

    Architecture: Deep residual MLP with LayerNorm for stable training.
    """

    def __init__(self, n_features: int = 32, hidden: int = 256):
        super().__init__()

        self.input_norm = nn.LayerNorm(n_features)

        # Block 1
        self.fc1 = nn.Linear(n_features, hidden)
        self.ln1 = nn.LayerNorm(hidden)

        # Block 2
        self.fc2 = nn.Linear(hidden, hidden)
        self.ln2 = nn.LayerNorm(hidden)

        # Block 3 (bottleneck)
        self.fc3 = nn.Linear(hidden, hidden // 2)
        self.ln3 = nn.LayerNorm(hidden // 2)

        # Block 4
        self.fc4 = nn.Linear(hidden // 2, 64)
        self.ln4 = nn.LayerNorm(64)

        # Output
        self.out = nn.Linear(64, 1)

        # Residual projection (n_features → hidden)
        self.res_proj = nn.Linear(n_features, hidden)

        self.drop = nn.Dropout(0.15)

        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, nonlinearity="relu")
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Normalize input
        x0 = self.input_norm(x)

        # Block 1 + residual
        h1 = F.gelu(self.ln1(self.fc1(x0)))
        res = self.res_proj(x0)
        h1 = h1 + res   # residual connection
        h1 = self.drop(h1)

        # Block 2
        h2 = F.gelu(self.ln2(self.fc2(h1)))
        h2 = h2 + h1    # residual
        h2 = self.drop(h2)

        # Block 3 (compress)
        h3 = F.gelu(self.ln3(self.fc3(h2)))
        h3 = self.drop(h3)

        # Block 4
        h4 = F.gelu(self.ln4(self.fc4(h3)))

        # Cost output in (0, 1)
        cost = torch.sigmoid(self.out(h4))
        return cost


def load_model(path: str, n_features: int = 32, device: str = "cpu") -> DynCostNet:
    """Load trained weights from disk."""
    model = DynCostNet(n_features=n_features)
    state = torch.load(path, map_location=device, weights_only=True)
    model.load_state_dict(state)
    model.eval()
    return model


def save_model(model: DynCostNet, path: str):
    """Save model weights."""
    torch.save(model.state_dict(), path)
    print(f"[DynCostNet] Saved → {path}")
