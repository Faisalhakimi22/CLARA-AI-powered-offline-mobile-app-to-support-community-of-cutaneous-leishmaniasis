"""Read-only split evaluation of CLARA's fixed research checkpoints.

Defaults to validation only. Explicit --split test and --output are required for
locked internal test evaluation; no weights or thresholds are modified. Reports
compare acquisition sources and annotation crops against predicted-mask crops.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont
from torch import nn
from torchvision.models import mobilenet_v3_small
from torchvision.models.segmentation import deeplabv3_mobilenet_v3_large

from train_models import DATA, OUT, SIZE, SegmentationDataset, classification_metrics, letterbox, tensor_image


HERE = Path(__file__).resolve().parent
REPORT = HERE / "reports" / "baseline_diagnosis"
SEGMENTATION_CHECKPOINT = OUT / "segmentation.pth"


def load_segmentation(checkpoint):
    seg = deeplabv3_mobilenet_v3_large(weights=None, weights_backbone=None, aux_loss=True)
    seg.classifier[-1] = nn.Conv2d(seg.classifier[-1].in_channels, 1, 1)
    seg.load_state_dict(torch.load(checkpoint, map_location="cpu", weights_only=True))
    return seg.eval()


def load_models():
    seg = load_segmentation(SEGMENTATION_CHECKPOINT)
    cls = mobilenet_v3_small(weights=None)
    cls.classifier[-1] = nn.Linear(cls.classifier[-1].in_features, 2)
    cls.load_state_dict(torch.load(OUT / "classifier.pth", map_location="cpu", weights_only=True))
    return seg.eval(), cls.eval()


def validation_classification_metrics(labels, scores):
    result = classification_metrics(np.asarray(labels), np.asarray(scores))
    # The shared training helper calls every evaluated split "test_images".
    result["images"] = result.pop("test_images")
    return result


def triage_metrics(rows):
    """Report the existing app thresholds, including every empty-mask abstention.

    No threshold search is performed. Missing localization is an uncertain result,
    not a negative; counts and coverage must accompany selective performance.
    """
    counts = {truth: {"CL": 0, "NON_CL": 0, "UNCERTAIN_SCORE": 0, "UNCERTAIN_MASK": 0}
              for truth in ("CL", "NON_CL")}
    correct_binary = {"CL": 0, "NON_CL": 0}
    totals = {"CL": 0, "NON_CL": 0}
    accepted_labels, accepted_scores = [], []
    for row in rows:
        truth, score = row["class"], row["predicted_mask_cl_score"]
        totals[truth] += 1
        outcome = ("UNCERTAIN_MASK" if score is None else "CL" if score > 0.8
                   else "NON_CL" if score < 0.2 else "UNCERTAIN_SCORE")
        counts[truth][outcome] += 1
        if score is not None:
            correct_binary[truth] += (score >= 0.5) == (truth == "CL")
        if outcome in ("CL", "NON_CL"):
            accepted_labels.append(0 if truth == "CL" else 1)
            accepted_scores.append(score)
    binary_effective = np.mean([correct_binary[truth] / totals[truth] for truth in totals])
    return {
        "thresholds": {"CL": ">0.8", "NON_CL": "<0.2", "uncertain": "0.2 through 0.8 or empty mask"},
        "by_true_class": counts,
        "decisive_predictions": len(accepted_labels),
        "decisive_coverage": len(accepted_labels) / len(rows),
        "abstentions": len(rows) - len(accepted_labels),
        "cl_false_low_predictions": counts["CL"]["NON_CL"],
        "total_cl_cases": totals["CL"],
        "balanced_correct_fraction_at_0_5_counting_empty_masks_as_unresolved": float(binary_effective),
        "decisive_metrics": validation_classification_metrics(accepted_labels, accepted_scores) if accepted_labels else None,
        "interpretation": "Selective metrics exclude abstentions; all-case counts are authoritative. Scores are uncalibrated research outputs.",
    }


def coarse_validation_names(split="val"):
    source = HERE.parent / "data" / "New folder" / "scabies valid.v1i.yolo26.zip"
    names = set()
    with zipfile.ZipFile(source) as archive:
        for name in archive.namelist():
            source_split = "valid" if split == "val" else "train"
            if name.startswith(f"{source_split}/labels/") and name.endswith(".txt"):
                if any(len(line.split()) == 5 for line in archive.read(name).decode().splitlines()):
                    names.add(f"mimic_{source_split}_" + Path(name).stem + ".jpg")
    return names


def remove_small_components(mask):
    """Match app's 4-connected minimum area of four model pixels."""
    result = mask.copy()
    seen = np.zeros_like(mask, dtype=bool)
    h, w = mask.shape
    for oy, ox in zip(*np.nonzero(mask)):
        if seen[oy, ox]:
            continue
        component = [(oy, ox)]
        seen[oy, ox] = True
        for y, x in component:
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    component.append((ny, nx))
        if len(component) < 4:
            for y, x in component:
                result[y, x] = False
    return result


def crop_predicted(image, mask):
    scale = min(SIZE / image.width, SIZE / image.height)
    width = max(1, round(image.width * scale))
    height = max(1, round(image.height * scale))
    left, top = (SIZE - width) // 2, (SIZE - height) // 2
    unpadded = mask[top:top + height, left:left + width]
    if not unpadded.any():
        return None
    ys, xs = np.nonzero(unpadded)
    x1, x2 = xs.min() / width, (xs.max() + 1) / width
    y1, y2 = ys.min() / height, (ys.max() + 1) / height
    px, py = max(0.04, (x2 - x1) * 0.25), max(0.04, (y2 - y1) * 0.25)
    bounds = (
        max(0, int((x1 - px) * image.width)), max(0, int((y1 - py) * image.height)),
        min(image.width, int((x2 + px) * image.width)), min(image.height, int((y2 + py) * image.height)),
    )
    original_mask = Image.fromarray(unpadded.astype(np.uint8) * 255).resize(image.size, Image.Resampling.NEAREST)
    background = Image.new("RGB", image.size, (120, 120, 120))
    background.paste(image, mask=original_mask)
    return background.crop(bounds).resize((SIZE, SIZE), Image.Resampling.BILINEAR)


def overlap(predicted, target):
    intersection = int(np.sum(predicted & target))
    pa, ta = int(predicted.sum()), int(target.sum())
    return {"dice": (2 * intersection + 1) / (pa + ta + 1), "iou": (intersection + 1) / (pa + ta - intersection + 1),
            "predicted_area_fraction": pa / predicted.size, "annotation_area_fraction": ta / target.size}


def aggregate(rows):
    if not rows:
        return {"images": 0}
    return {"images": len(rows), "mean_dice": float(np.mean([r["dice"] for r in rows])),
            "median_dice": float(np.median([r["dice"] for r in rows])), "mean_iou": float(np.mean([r["iou"] for r in rows])),
            "dice_below_0_2": sum(r["dice"] < 0.2 for r in rows), "empty_masks": sum(r["predicted_area_fraction"] == 0 for r in rows),
            "mean_prediction_area": float(np.mean([r["predicted_area_fraction"] for r in rows])),
            "mean_annotation_area": float(np.mean([r["annotation_area_fraction"] for r in rows]))}


def batchnorm_audit(seg, cls):
    result = {}
    cached = Path(torch.hub.get_dir()) / "checkpoints"
    for name, model, file, prefix in [
        ("segmentation", seg, "deeplabv3_mobilenet_v3_large-fc3c493d.pth", "backbone."),
        ("classifier", cls, "mobilenet_v3_small-047dcff4.pth", "features."),
    ]:
        pretrained = torch.load(cached / file, map_location="cpu", weights_only=True)
        trained = model.state_dict()
        keys = [key for key in trained if key.startswith(prefix) and key.endswith("running_mean")]
        values = [float(torch.max(torch.abs(trained[k] - pretrained[k]))) for k in keys]
        counter_keys = [key for key in trained if key.startswith(prefix) and key.endswith("num_batches_tracked")]
        deltas = [int(trained[k] - pretrained[k]) for k in counter_keys]
        result[name] = {"backbone_batchnorm_layers": len(keys), "layers_with_changed_running_means": sum(v > 0 for v in values),
                        "maximum_running_mean_absolute_change": max(values), "additional_batches_tracked_min": min(deltas),
                        "additional_batches_tracked_max": max(deltas)}
    return result


def grid(rows, masks, selection, filename, split="val"):
    cell, title_h = 200, 38
    canvas = Image.new("RGB", (cell * 3, (cell + title_h) * len(selection) + 38), "white")
    draw = ImageDraw.Draw(canvas)
    scope = "validation only" if split == "val" else "locked internal test"
    draw.text((8, 10), f"Image | annotation (green) | model mask (red); {scope}", fill="black")
    for position, index in enumerate(selection):
        row = rows[index]
        source = Image.open(DATA / "segmentation" / "images" / split / row["name"]).convert("RGB")
        source = letterbox(source, SIZE).resize((cell, cell))
        top = 38 + position * (cell + title_h)
        target, predicted = masks[index]
        for column, binary, color in [(0, None, (0, 0, 0)), (1, target, (0, 190, 80)), (2, predicted, (210, 0, 35))]:
            panel = source.copy()
            if binary is not None:
                mask = Image.fromarray(binary.astype(np.uint8) * 95).resize((cell, cell), Image.Resampling.NEAREST)
                panel.paste(Image.new("RGB", panel.size, color), mask=mask)
            canvas.paste(panel, (column * cell, top + title_h))
        draw.text((8, top + 3), f"{row['class']}  Dice={row['dice']:.3f}  approximate box={row['coarse_box']}", fill="black")
        draw.text((8, top + 18), row["name"][:86], fill="black")
    canvas.save(REPORT / filename)


def comparison_grid(rows, masks, selection, baseline_checkpoint):
    baseline = load_segmentation(baseline_checkpoint)
    cell, title_h = 200, 42
    canvas = Image.new("RGB", (cell * 4, (cell + title_h) * len(selection) + 38), "white")
    draw = ImageDraw.Draw(canvas)
    draw.text((8, 10), "Image | annotation (green) | baseline (red) | candidate (blue); fixed validation cases", fill="black")
    for position, index in enumerate(selection):
        row = rows[index]
        source = Image.open(DATA / "segmentation" / "images" / "val" / row["name"]).convert("RGB")
        resized = letterbox(source, SIZE)
        with torch.inference_mode():
            old_mask = baseline(tensor_image(resized)[None])["out"][0, 0].numpy() >= 0
        target, new_mask = masks[index]
        panel_source = resized.resize((cell, cell))
        top = 38 + position * (cell + title_h)
        for column, binary, color in [(0, None, (0, 0, 0)), (1, target, (0, 190, 80)),
                                      (2, old_mask, (210, 0, 35)), (3, new_mask, (30, 95, 220))]:
            panel = panel_source.copy()
            if binary is not None:
                overlay = Image.fromarray(binary.astype(np.uint8) * 95).resize((cell, cell), Image.Resampling.NEAREST)
                panel.paste(Image.new("RGB", panel.size, color), mask=overlay)
            canvas.paste(panel, (column * cell, top + title_h))
        draw.text((8, top + 3), f"{row['class']}  Baseline Dice={overlap(old_mask, target)['dice']:.3f}; candidate Dice={row['dice']:.3f}; box={row['coarse_box']}", fill="black")
        draw.text((8, top + 20), row["name"][:110], fill="black")
    canvas.save(REPORT / "validation_grid_comparison_fixed.png")


def main():
    global REPORT, SEGMENTATION_CHECKPOINT
    parser = argparse.ArgumentParser()
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--split", choices=("val", "test"), default="val")
    parser.add_argument("--segmentation-checkpoint", type=Path, default=SEGMENTATION_CHECKPOINT)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--baseline-report", type=Path, default=None)
    parser.add_argument("--baseline-checkpoint", type=Path, default=OUT / "segmentation.pth")
    args = parser.parse_args()
    if args.split == "test" and args.output is None:
        parser.error("Test evaluation requires an explicit --output; existing validation reports must be preserved")
    if args.split == "test" and args.baseline_report:
        parser.error("Baseline comparisons are validation-only; test evaluation uses the already selected model")
    if args.threads < 1:
        parser.error("--threads must be positive")
    REPORT = args.output or REPORT
    SEGMENTATION_CHECKPOINT = args.segmentation_checkpoint
    torch.set_num_threads(min(2, args.threads))
    REPORT.mkdir(parents=True, exist_ok=True)
    scope_name = "validation" if args.split == "val" else "test"
    checkpoint_hash = hashlib.sha256(SEGMENTATION_CHECKPOINT.read_bytes()).hexdigest()
    classifier_hash = hashlib.sha256((OUT / "classifier.pth").read_bytes()).hexdigest()
    evaluation_lock = None
    if args.split == "test":
        if (REPORT / "test.json").exists():
            raise FileExistsError("Locked test report already exists; refusing a repeated test run")
        manifest_path = HERE.parent / "assets" / "models" / "manifest.json"
        export_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for stage, expected in (("segmentation", checkpoint_hash), ("classifier", classifier_hash)):
            if export_manifest["models"][stage]["source_checkpoint_sha256"] != expected:
                raise ValueError(f"Selected {stage} checkpoint does not match the promoted export manifest")
        evaluation_lock = {
            "started_at_utc": datetime.now(timezone.utc).isoformat(),
            "split": "test",
            "segmentation_checkpoint_sha256": checkpoint_hash,
            "classifier_checkpoint_sha256": classifier_hash,
            "evaluation_script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "export_manifest_sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
            "export_model_id": export_manifest["id"],
            "exported_onnx_sha256": {stage: export_manifest["models"][stage]["sha256"] for stage in ("segmentation", "classifier")},
            "segmentation_threshold": 0.5,
            "classifier_review_band": [0.2, 0.8],
            "selection": "Refined-v2 selected and promoted using train/validation data before this evaluation. No test-based tuning or training is permitted.",
            "prior_exposure": "Original baseline had previously been tested. One CL test image was used solely for UI smoke tests. This is an internal evaluation, not a pristine external holdout.",
            "evaluation_scope": "Internal image-level test only. Patient identities and split separation are unverified; acquisition source is confounded with disease class. Not independent patient-level, external, or clinical validation.",
        }
        # Exclusive creation prevents accidental repeats, including after a failed
        # run; an interrupted evaluation requires explicit human review to resume.
        with (REPORT / "test_evaluation_lock.json").open("x", encoding="utf-8") as handle:
            json.dump(evaluation_lock, handle, indent=2)
    seg, cls = load_models()
    dataset = SegmentationDataset(args.split)
    boxes = coarse_validation_names(args.split)
    rows, masks, annotations, predictions, labels = [], [], [], [], []
    start = time.monotonic()
    with torch.inference_mode():
        for i in range(len(dataset)):
            tensor, target_tensor = dataset[i]
            image = Image.open(dataset.files[i]).convert("RGB")
            logits = seg(tensor[None])["out"][0, 0].numpy()
            target = target_tensor[0].numpy() >= 0.5
            mask = logits >= 0
            scale = min(SIZE / image.width, SIZE / image.height)
            width, height = max(1, round(image.width * scale)), max(1, round(image.height * scale))
            left, top = (SIZE - width) // 2, (SIZE - height) // 2
            content_mask = np.zeros_like(mask)
            content_mask[top:top + height, left:left + width] = mask[top:top + height, left:left + width]
            app_mask = remove_small_components(content_mask)
            name = dataset.files[i].name
            label = 0 if name.startswith("cl_") else 1
            disease = "CL" if label == 0 else "NON_CL"
            row = {"name": name, "class": disease, "coarse_box": name in boxes, **overlap(mask, target),
                   "app_postprocessing_dice": overlap(app_mask, target)["dice"]}
            annotation_crop = Image.open(DATA / "classification" / args.split / disease / name).convert("RGB").resize((SIZE, SIZE), Image.Resampling.BILINEAR)
            annotation_score = float(torch.softmax(cls(tensor_image(annotation_crop)[None]), dim=1)[0, 0])
            crop = crop_predicted(image, app_mask)
            score = None if crop is None else float(torch.softmax(cls(tensor_image(crop)[None]), dim=1)[0, 0])
            row.update({"annotation_crop_cl_score": annotation_score, "predicted_mask_cl_score": score})
            rows.append(row)
            masks.append((target, app_mask))
            annotations.append(annotation_score)
            predictions.append(score)
            labels.append(label)
            if (i + 1) % 50 == 0:
                print(f"{scope_name.title()} {i + 1}/{len(dataset)}; {time.monotonic() - start:.1f}s", flush=True)
    subgroups = {"all": aggregate(rows)}
    for disease in ("CL", "NON_CL"):
        subgroups[disease] = aggregate([r for r in rows if r["class"] == disease])
    for coarse in (False, True):
        subgroups["coarse_box" if coarse else "polygon"] = aggregate([r for r in rows if r["coarse_box"] == coarse])
    available = [i for i, score in enumerate(predictions) if score is not None]
    result = {
        "scope": ("Validation set only. No test image read, threshold changed, checkpoint modified, or training performed." if args.split == "val"
                  else "Locked internal test evaluation of the previously selected refined-v2 pair. No threshold changed, checkpoint modified, training, or model selection performed."),
        "split": args.split,
        "image_size": SIZE, "threshold": 0.5, "segmentation_checkpoint_sha256": checkpoint_hash,
        "classifier_checkpoint_sha256": classifier_hash,
        "segmentation": subgroups,
        "app_postprocessing": {"mean_dice": float(np.mean([r["app_postprocessing_dice"] for r in rows])),
                               "mean_absolute_dice_change": float(np.mean([abs(r["app_postprocessing_dice"] - r["dice"]) for r in rows]))},
        "batchnorm_audit": batchnorm_audit(seg, cls),
        f"classification_annotation_crops_{scope_name}": validation_classification_metrics(np.array(labels), np.array(annotations)),
        f"classification_predicted_masks_{scope_name}": validation_classification_metrics(np.array(labels)[available], np.array([predictions[i] for i in available])),
        "triage_with_abstentions": triage_metrics(rows),
        "empty_mask_abstentions": {"total": len(rows) - len(available), "CL": sum(r["class"] == "CL" and r["predicted_mask_cl_score"] is None for r in rows)},
        "elapsed_seconds": time.monotonic() - start, "images": rows,
    }
    if evaluation_lock:
        result["evaluation_lock"] = evaluation_lock
    if args.baseline_report:
        baseline = json.loads(args.baseline_report.read_text(encoding="utf-8"))
        if [r["name"] for r in baseline["images"]] != [r["name"] for r in rows]:
            raise ValueError("Baseline and candidate validation images must match exactly")
        result["baseline_comparison"] = {
            "segmentation_checkpoint_sha256": baseline["segmentation_checkpoint_sha256"],
            "classification_predicted_masks_validation": baseline["classification_predicted_masks_validation"],
            "triage_with_abstentions": triage_metrics(baseline["images"]),
            "segmentation_mean_dice_delta_by_class": {
                name: subgroups[name]["mean_dice"] - baseline["segmentation"][name]["mean_dice"]
                for name in ("CL", "NON_CL", "all")},
        }
    (REPORT / f"{scope_name}.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    fixed = []
    worst = []
    for disease in ("CL", "NON_CL"):
        indices = [i for i, row in enumerate(rows) if row["class"] == disease]
        fixed.extend(indices[round(n * (len(indices) - 1) / 3)] for n in range(4))
        worst.extend(sorted(indices, key=lambda i: rows[i]["dice"])[:3])
    grid(rows, masks, fixed, f"{scope_name}_grid_fixed.png", args.split)
    grid(rows, masks, worst, f"{scope_name}_grid_failures.png", args.split)
    if args.baseline_report:
        comparison_grid(rows, masks, fixed, args.baseline_checkpoint)
    print(json.dumps({key: value for key, value in result.items() if key != "images"}, indent=2))


if __name__ == "__main__":
    main()
