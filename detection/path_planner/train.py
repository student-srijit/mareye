"""
train.py — Training script for DynCostNet

Colab usage:
    !git clone <your-repo> && cd mareye-ai-main
    !pip install torch numpy scipy tqdm
    !python detection/path_planner/train.py --samples 200000 --epochs 60 --output detection/path_planner/dyn_cost_net.pt

Local usage:
    python detection/path_planner/train.py

The model trains in ~5–10 minutes on Colab T4 GPU.
On CPU: ~25 minutes for 200k samples / 60 epochs.
"""

import os
import sys
import argparse
import time
import math

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset, random_split

# Allow running as script from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from detection.path_planner.threat_model import DynCostNet, save_model
from detection.path_planner.data_generator import generate_dataset
from detection.path_planner.config import N_FEATURES, MODEL_PATH


def cosine_lr(optimizer, epoch: int, max_epochs: int, min_lr: float = 1e-6, max_lr: float = 3e-4):
    """Cosine annealing learning rate schedule."""
    lr = min_lr + 0.5 * (max_lr - min_lr) * (1 + math.cos(math.pi * epoch / max_epochs))
    for pg in optimizer.param_groups:
        pg["lr"] = lr
    return lr


def train(args):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"\n{'='*60}")
    print(f"  MarEye DynCostNet — Training")
    print(f"  Device  : {device}")
    print(f"  Samples : {args.samples:,}")
    print(f"  Epochs  : {args.epochs}")
    print(f"  Output  : {args.output}")
    print(f"{'='*60}\n")

    # ── Generate / Load Data ──────────────────────────────────────────────────
    cache_path = args.output.replace(".pt", "_data_cache.npz")
    if args.use_cache and os.path.exists(cache_path):
        print(f"[Data] Loading cached dataset from {cache_path}")
        npz = np.load(cache_path)
        X_np, y_np = npz["X"].astype(np.float32), npz["y"].astype(np.float32)
        print(f"[Data] Loaded: X={X_np.shape}, y={y_np.shape}")
    else:
        print("[Data] Generating synthetic training data...")
        t0 = time.time()
        X_np, y_np = generate_dataset(n_samples=args.samples, verbose=True)
        print(f"[Data] Generated in {time.time() - t0:.1f}s")
        if args.use_cache:
            np.savez(cache_path, X=X_np, y=y_np)
            print(f"[Data] Cached → {cache_path}")

    # ── Build Dataset ─────────────────────────────────────────────────────────
    X_t = torch.from_numpy(X_np)
    y_t = torch.from_numpy(y_np).unsqueeze(1)   # (N, 1)

    dataset = TensorDataset(X_t, y_t)
    val_size = max(1000, int(len(dataset) * 0.1))
    train_size = len(dataset) - val_size
    train_ds, val_ds = random_split(dataset, [train_size, val_size],
                                    generator=torch.Generator().manual_seed(42))

    loader_kw = dict(batch_size=args.batch_size, num_workers=0, pin_memory=(device.type == "cuda"))
    train_loader = DataLoader(train_ds, shuffle=True, **loader_kw)
    val_loader   = DataLoader(val_ds,   shuffle=False, **loader_kw)

    print(f"[Split] Train: {len(train_ds):,}  Val: {len(val_ds):,}")

    # ── Model, Optimizer, Loss ────────────────────────────────────────────────
    model = DynCostNet(n_features=N_FEATURES, hidden=256).to(device)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"[Model] Parameters: {total_params:,}")

    optimizer = optim.AdamW(model.parameters(), lr=3e-4, weight_decay=1e-4)

    # Huber loss — robust to outliers (rare pathological cost values)
    criterion = nn.HuberLoss(delta=0.1)

    # ── Training Loop ─────────────────────────────────────────────────────────
    best_val_loss = float("inf")
    best_epoch = 0
    history = {"train": [], "val": [], "lr": []}

    print(f"\n{'Ep':>4}  {'Train L':>10}  {'Val L':>10}  {'LR':>10}  {'Best':>6}  {'Time':>8}")
    print("-" * 60)

    for epoch in range(1, args.epochs + 1):
        t_ep = time.time()

        # LR schedule
        lr = cosine_lr(optimizer, epoch - 1, args.epochs)

        # ── Train ──
        model.train()
        train_losses = []
        for X_b, y_b in train_loader:
            X_b, y_b = X_b.to(device), y_b.to(device)
            optimizer.zero_grad(set_to_none=True)
            pred = model(X_b)
            loss = criterion(pred, y_b)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            train_losses.append(loss.item())

        # ── Validate ──
        model.eval()
        val_losses = []
        with torch.no_grad():
            for X_b, y_b in val_loader:
                X_b, y_b = X_b.to(device), y_b.to(device)
                pred = model(X_b)
                loss = criterion(pred, y_b)
                val_losses.append(loss.item())

        tl = np.mean(train_losses)
        vl = np.mean(val_losses)
        history["train"].append(tl)
        history["val"].append(vl)
        history["lr"].append(lr)

        is_best = vl < best_val_loss
        if is_best:
            best_val_loss = vl
            best_epoch = epoch
            save_model(model, args.output)

        elapsed = time.time() - t_ep
        best_marker = "◀ BEST" if is_best else ""
        print(f"{epoch:>4}  {tl:>10.5f}  {vl:>10.5f}  {lr:>10.2e}  {best_marker:<6}  {elapsed:>6.1f}s")

        # Early stopping
        if epoch - best_epoch > args.patience:
            print(f"\n[EarlyStopping] No improvement for {args.patience} epochs. Stopping.")
            break

    print(f"\n{'='*60}")
    print(f"  Training complete!")
    print(f"  Best val loss : {best_val_loss:.5f} (epoch {best_epoch})")
    print(f"  Model saved   : {args.output}")
    print(f"{'='*60}")

    # ── Final evaluation on val set ───────────────────────────────────────────
    best_model = DynCostNet(n_features=N_FEATURES, hidden=256).to(device)
    state = torch.load(args.output, map_location=device, weights_only=True)
    best_model.load_state_dict(state)
    best_model.eval()

    all_preds, all_tgts = [], []
    with torch.no_grad():
        for X_b, y_b in val_loader:
            p = best_model(X_b.to(device)).cpu().numpy().flatten()
            t = y_b.numpy().flatten()
            all_preds.extend(p)
            all_tgts.extend(t)

    all_preds = np.array(all_preds)
    all_tgts  = np.array(all_tgts)
    mae = np.mean(np.abs(all_preds - all_tgts))
    rmse = np.sqrt(np.mean((all_preds - all_tgts) ** 2))
    print(f"\n  Validation MAE  : {mae:.5f}")
    print(f"  Validation RMSE : {rmse:.5f}")
    print(f"  Predicted range : [{all_preds.min():.3f}, {all_preds.max():.3f}]")
    print(f"  Target range    : [{all_tgts.min():.3f}, {all_tgts.max():.3f}]")

    return history


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train MarEye DynCostNet")
    parser.add_argument("--samples",    type=int,   default=200_000,   help="Training samples to generate")
    parser.add_argument("--epochs",     type=int,   default=60,        help="Max training epochs")
    parser.add_argument("--batch_size", type=int,   default=2048,      help="Batch size")
    parser.add_argument("--patience",   type=int,   default=10,        help="Early stopping patience")
    parser.add_argument("--output",     type=str,   default=MODEL_PATH, help="Output .pt path")
    parser.add_argument("--use_cache",  action="store_true",           help="Cache/reuse generated data")
    args = parser.parse_args()

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    train(args)
