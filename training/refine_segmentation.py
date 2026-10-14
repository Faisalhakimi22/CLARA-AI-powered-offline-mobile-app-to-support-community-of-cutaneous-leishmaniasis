"""Validation-selected segmentation experiment; never overwrites deployed models.

Fixes the first CPU baseline's BatchNorm drift in frozen features, uses only
polygon-annotated training images, balances CL/mimic sampling, and caches fixed
backbone features to keep head training practical on CPU. No test data is read.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import time
import zipfile
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
from torchvision.models.segmentation import deeplabv3_mobilenet_v3_large

from train_models import DATA, OUT, SIZE, SegmentationDataset


HERE = Path(__file__).resolve().parent


def coarse_names():
    names = set()
    with zipfile.ZipFile(HERE.parent / "data" / "New folder" / "scabies valid.v1i.yolo26.zip") as archive:
        for name in archive.namelist():
            if "/labels/" in name and name.endswith(".txt"):
                if any(len(line.split()) == 5 for line in archive.read(name).decode().splitlines()):
                    split = Path(name).parts[0]
                    names.add(f"mimic_{split}_{Path(name).stem}.jpg")
    return names


def build_model():
    model = deeplabv3_mobilenet_v3_large(weights=None, weights_backbone=None, aux_loss=True)
    model.classifier[-1] = nn.Conv2d(model.classifier[-1].in_channels, 1, 1)
    model.load_state_dict(torch.load(OUT / "segmentation.pth", map_location="cpu", weights_only=True))
    pretrained = torch.load(Path(torch.hub.get_dir()) / "checkpoints" / "deeplabv3_mobilenet_v3_large-fc3c493d.pth", map_location="cpu", weights_only=True)
    # requires_grad=False alone does not freeze BN running buffers. Restore the
    # original pretrained backbone statistics, then keep the backbone in eval().
    backbone_state = {key.removeprefix("backbone."): value for key, value in pretrained.items() if key.startswith("backbone.")}
    model.backbone.load_state_dict(backbone_state)
    for parameter in model.parameters():
        parameter.requires_grad = False
    for parameter in model.classifier.parameters():
        parameter.requires_grad = True
    return model.eval()


def cache_features(model, split, boxes, augment):
    dataset = SegmentationDataset(split)
    selected = [i for i, path in enumerate(dataset.files) if split != "train" or path.name not in boxes]
    features, targets, labels, names = [], [], [], []
    with torch.inference_mode():
        for count, index in enumerate(selected):
            image, target = dataset[index]
            variants = [(image, target)]
            if augment:
                variants.append((image.flip(-1), target.flip(-1)))
            for im, mask in variants:
                features.append(model.backbone(im[None])["out"][0].to(torch.float16).clone())
                targets.append(mask.to(torch.uint8).clone())
                labels.append(0 if dataset.files[index].name.startswith("cl_") else 1)
                names.append(dataset.files[index].name)
            if (count + 1) % 200 == 0:
                print(f"Cached {split}: {count + 1}/{len(selected)} source images", flush=True)
    # Clone after inference_mode to permit autograd saving these constant inputs.
    return torch.stack(features).clone(), torch.stack(targets).clone(), np.asarray(labels), names


def validation(model, cache, batch_size=16):
    features, targets, labels, names = cache
    model.eval()
    dices, ious = [], []
    with torch.inference_mode():
        for start in range(0, len(features), batch_size):
            logits = F.interpolate(model.classifier(features[start:start + batch_size].float()), size=(SIZE, SIZE), mode="bilinear", align_corners=False)
            prediction = logits >= 0
            target = targets[start:start + batch_size] >= 1
            intersection = (prediction & target).sum((1, 2, 3)).float()
            pa, ta = prediction.sum((1, 2, 3)).float(), target.sum((1, 2, 3)).float()
            dices.extend(((2 * intersection + 1) / (pa + ta + 1)).tolist())
            ious.extend(((intersection + 1) / (pa + ta - intersection + 1)).tolist())
    dices, ious = np.asarray(dices), np.asarray(ious)
    by_class = {disease: float(dices[labels == label].mean()) for label, disease in enumerate(("CL", "NON_CL"))}
    return {"dice": float(dices.mean()), "iou": float(ious.mean()), "by_class_dice": by_class,
            "balanced_dice": float(np.mean(list(by_class.values()))), "per_image_dice": dict(zip(names, dices.tolist()))}


def compact(row):
    return {key: value for key, value in row.items() if key != "per_image_dice"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--output", type=Path, default=HERE / "candidates" / "segmentation_refinement_v1")
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit(f"Candidate directory exists; choose a fresh --output: {args.output}")
    args.output.mkdir(parents=True)
    random.seed(4217)
    np.random.seed(4217)
    torch.manual_seed(4217)
    torch.set_num_threads(min(2, args.threads))
    baseline = json.loads((HERE / "reports" / "baseline_diagnosis" / "validation.json").read_text())
    model = build_model()
    boxes = coarse_names()
    started = time.monotonic()
    train = cache_features(model, "train", boxes, augment=True)
    val = cache_features(model, "val", boxes, augment=False)
    features, targets, labels, names = train
    counts = np.bincount(labels, minlength=2)
    sample_weights = torch.tensor([1.0 / counts[label] for label in labels], dtype=torch.double)
    print(f"Cache ready in {time.monotonic() - started:.1f}s; train source images={len(set(names))}, augmented variants={len(names)}, CL/non-CL={counts.tolist()}", flush=True)
    optimizer = torch.optim.AdamW(model.classifier.parameters(), lr=0.00015, weight_decay=0.0001)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    bce = nn.BCEWithLogitsLoss()
    initial = validation(model, val, args.batch_size)
    print(f"Initial restored-backbone validation: {json.dumps(compact(initial))}", flush=True)
    history = []
    best = -1.0
    checkpoint = args.output / "segmentation.pth"
    # The statistics of the frozen backbone cannot change during cached-head
    # training. Only the head enters train mode, including its own BatchNorm.
    batches = math.ceil(len(set(names)) / args.batch_size)
    for epoch in range(args.epochs):
        model.eval()
        model.classifier.train()
        indices = torch.multinomial(sample_weights, batches * args.batch_size, replacement=True)
        losses = []
        epoch_started = time.monotonic()
        for batch in indices.split(args.batch_size):
            optimizer.zero_grad(set_to_none=True)
            logits = F.interpolate(model.classifier(features[batch].float()), size=(SIZE, SIZE), mode="bilinear", align_corners=False)
            target = targets[batch].float()
            probabilities = torch.sigmoid(logits)
            intersection = (probabilities * target).sum((1, 2, 3))
            dice_loss = 1 - ((2 * intersection + 1) / (probabilities.sum((1, 2, 3)) + target.sum((1, 2, 3)) + 1)).mean()
            loss = bce(logits, target) + dice_loss
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach()))
        scheduler.step()
        result = validation(model, val, args.batch_size)
        row = {"epoch": epoch + 1, "train_loss": float(np.mean(losses)), "validation": compact(result), "seconds": time.monotonic() - epoch_started}
        history.append(row)
        print(json.dumps(row), flush=True)
        if result["balanced_dice"] > best:
            best = result["balanced_dice"]
            torch.save(model.state_dict(), checkpoint)
            (args.output / "best_validation.json").write_text(json.dumps({"epoch": epoch + 1, **result}, indent=2), encoding="utf-8")
        (args.output / "history.json").write_text(json.dumps(history, indent=2), encoding="utf-8")
    selected = json.loads((args.output / "best_validation.json").read_text())
    report = {
        "scope": "Validation-selected research experiment. Test untouched; deployed model files unchanged.",
        "seed": 4217, "image_size": SIZE, "training_source_images": len(set(names)), "training_variants": len(names),
        "exclusion": "Training images containing any box-derived pseudo-mask excluded from segmentation refinement.",
        "training_class_counts_including_mirrors": counts.tolist(),
        "changes": ["Restore pretrained frozen-backbone BatchNorm buffers; backbone remains eval throughout", "Equal CL/mimic weighted sampling", "Exclude box-derived masks from training", "Deterministic mirror feature augmentation", "10 head-only epochs (configurable), validation-balanced Dice checkpoint selection"],
        "baseline_validation": baseline["segmentation"], "initial_restored_backbone": compact(initial), "selected": compact(selected),
        "history": history, "elapsed_seconds": time.monotonic() - started,
        "candidate_checkpoint_sha256": hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
        "promotion": "Pending independent validation review and predicted-mask classifier compatibility; do not auto-replace deployed assets.",
    }
    (args.output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"candidate": str(checkpoint), "selected": compact(selected), "elapsed_seconds": report["elapsed_seconds"]}, indent=2))


if __name__ == "__main__":
    main()
