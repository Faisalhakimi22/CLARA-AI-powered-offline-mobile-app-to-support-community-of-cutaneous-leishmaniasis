"""Train a local research baseline: DeepLabV3 lesion mask + MobileNetV3 CL classifier."""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageEnhance, ImageOps
from sklearn.metrics import accuracy_score, balanced_accuracy_score, roc_auc_score
from torch import nn
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision import transforms
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small
from torchvision.models.segmentation import (
    DeepLabV3_MobileNet_V3_Large_Weights,
    deeplabv3_mobilenet_v3_large,
)


HERE = Path(__file__).resolve().parent
DATA = HERE / "prepared"
OUT = HERE / "models"
# Small inputs keep this CPU-only research baseline practical; revisit after
# collecting a representative, patient-separated dataset and training hardware.
SIZE = 128
MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)


def tensor_image(image: Image.Image) -> torch.Tensor:
    array = np.asarray(image, dtype=np.float32) / 255.0
    tensor = torch.from_numpy(array).permute(2, 0, 1)
    return transforms.Normalize(MEAN, STD)(tensor)


def letterbox(image: Image.Image, size: int, mask: bool = False) -> Image.Image:
    scale = min(size / image.width, size / image.height)
    width = max(1, round(image.width * scale))
    height = max(1, round(image.height * scale))
    resample = Image.Resampling.NEAREST if mask else Image.Resampling.BILINEAR
    image = image.resize((width, height), resample)
    mode = "L" if mask else "RGB"
    fill = 0 if mask else (114, 114, 114)
    canvas = Image.new(mode, (size, size), fill)
    canvas.paste(image, ((size - width) // 2, (size - height) // 2))
    return canvas


class SegmentationDataset(Dataset):
    def __init__(self, split: str, augment: bool = False) -> None:
        self.image_dir = DATA / "segmentation" / "images" / split
        self.label_dir = DATA / "segmentation" / "labels" / split
        self.files = sorted(self.image_dir.glob("*.jpg"))
        self.augment = augment

    def __len__(self) -> int:
        return len(self.files)

    def __getitem__(self, index: int):
        image_path = self.files[index]
        label_path = self.label_dir / f"{image_path.stem}.txt"
        image = Image.open(image_path).convert("RGB")
        mask = Image.new("L", image.size, 0)
        draw = ImageDraw.Draw(mask)
        for line in label_path.read_text(encoding="utf-8").splitlines():
            values = [float(value) for value in line.split()[1:]]
            points = [(values[i] * image.width, values[i + 1] * image.height) for i in range(0, len(values), 2)]
            draw.polygon(points, fill=255)
        image = letterbox(image, SIZE)
        mask = letterbox(mask, SIZE, mask=True)
        if self.augment and random.random() < 0.5:
            image = ImageOps.mirror(image)
            mask = ImageOps.mirror(mask)
        if self.augment:
            image = ImageEnhance.Brightness(image).enhance(random.uniform(0.9, 1.1))
            image = ImageEnhance.Contrast(image).enhance(random.uniform(0.9, 1.1))
        image_tensor = tensor_image(image)
        mask_tensor = torch.from_numpy(np.asarray(mask, dtype=np.float32).copy()[None, ...] / 255.0)
        return image_tensor, mask_tensor


class ClassificationDataset(Dataset):
    def __init__(self, split: str, augment: bool = False) -> None:
        self.root = DATA / "classification" / split
        self.classes = ["CL", "NON_CL"]
        self.items = [
            (path, label)
            for label, class_name in enumerate(self.classes)
            for path in sorted((self.root / class_name).glob("*.jpg"))
        ]
        self.augment = augment

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, index: int):
        path, label = self.items[index]
        image = Image.open(path).convert("RGB").resize((SIZE, SIZE), Image.Resampling.BILINEAR)
        if self.augment:
            if random.random() < 0.5:
                image = ImageOps.mirror(image)
            image = ImageEnhance.Brightness(image).enhance(random.uniform(0.9, 1.1))
            image = ImageEnhance.Contrast(image).enhance(random.uniform(0.9, 1.1))
            image = ImageEnhance.Color(image).enhance(random.uniform(0.9, 1.1))
        return tensor_image(image), label


def dice_iou(logits: torch.Tensor, target: torch.Tensor) -> tuple[float, float]:
    predicted = torch.sigmoid(logits) >= 0.5
    target = target >= 0.5
    intersection = (predicted & target).sum(dim=(1, 2, 3)).float()
    predicted_area = predicted.sum(dim=(1, 2, 3)).float()
    target_area = target.sum(dim=(1, 2, 3)).float()
    dice = (2 * intersection + 1) / (predicted_area + target_area + 1)
    union = predicted_area + target_area - intersection
    iou = (intersection + 1) / (union + 1)
    return float(dice.mean()), float(iou.mean())


def evaluate_segmentation(model: nn.Module, loader: DataLoader, device: torch.device) -> dict[str, float]:
    model.eval()
    dice_values: list[float] = []
    iou_values: list[float] = []
    with torch.no_grad():
        for images, masks in loader:
            images, masks = images.to(device), masks.to(device)
            logits = model(images)["out"]
            dice, iou = dice_iou(logits, masks)
            dice_values.append(dice)
            iou_values.append(iou)
    return {"dice": float(np.mean(dice_values)), "iou": float(np.mean(iou_values))}


def train_segmentation(epochs: int, batch_size: int, device: torch.device) -> tuple[nn.Module, dict]:
    train_set = SegmentationDataset("train", augment=True)
    val_set = SegmentationDataset("val")
    test_set = SegmentationDataset("test")
    train_loader = DataLoader(train_set, batch_size=batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_set, batch_size=batch_size, shuffle=False, num_workers=0)
    test_loader = DataLoader(test_set, batch_size=batch_size, shuffle=False, num_workers=0)

    weights = DeepLabV3_MobileNet_V3_Large_Weights.COCO_WITH_VOC_LABELS_V1
    model = deeplabv3_mobilenet_v3_large(weights=weights, aux_loss=None)
    # Freeze the pretrained feature extractor for a quick, stable CPU baseline.
    for parameter in model.backbone.parameters():
        parameter.requires_grad = False
    last = model.classifier[-1]
    model.classifier[-1] = nn.Conv2d(last.in_channels, 1, kernel_size=1)
    model.to(device)
    optimizer = torch.optim.AdamW((p for p in model.parameters() if p.requires_grad), lr=0.0005, weight_decay=0.0001)
    bce = nn.BCEWithLogitsLoss()
    best_dice = -1.0
    best_path = OUT / "segmentation_best.pth"
    history = []

    for epoch in range(epochs):
        model.train()
        losses = []
        for images, masks in train_loader:
            images, masks = images.to(device), masks.to(device)
            optimizer.zero_grad(set_to_none=True)
            logits = model(images)["out"]
            bce_loss = bce(logits, masks)
            probabilities = torch.sigmoid(logits)
            intersection = (probabilities * masks).sum(dim=(1, 2, 3))
            dice_loss = 1 - ((2 * intersection + 1) / (probabilities.sum(dim=(1, 2, 3)) + masks.sum(dim=(1, 2, 3)) + 1)).mean()
            loss = bce_loss + dice_loss
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach().cpu()))
        validation = evaluate_segmentation(model, val_loader, device)
        row = {"epoch": epoch + 1, "train_loss": float(np.mean(losses)), "validation": validation}
        history.append(row)
        print(f"SEG epoch {epoch + 1}/{epochs}: loss={row['train_loss']:.4f}, val_dice={validation['dice']:.4f}, val_iou={validation['iou']:.4f}", flush=True)
        if validation["dice"] > best_dice:
            best_dice = validation["dice"]
            torch.save(model.state_dict(), best_path)

    model.load_state_dict(torch.load(best_path, map_location=device, weights_only=True))
    test_metrics = evaluate_segmentation(model, test_loader, device)
    torch.save(model.state_dict(), OUT / "segmentation.pth")
    return model, {"history": history, "test": test_metrics, "best_checkpoint": str(best_path)}


def classification_predictions(model: nn.Module, loader: DataLoader, device: torch.device):
    model.eval()
    labels: list[int] = []
    probabilities: list[float] = []
    with torch.no_grad():
        for images, batch_labels in loader:
            logits = model(images.to(device))
            probabilities.extend(torch.softmax(logits, dim=1)[:, 0].cpu().tolist())
            labels.extend(batch_labels.tolist())
    return np.asarray(labels), np.asarray(probabilities)


def classification_metrics(labels: np.ndarray, probabilities: np.ndarray) -> dict[str, float | int]:
    # probabilities contain P(CL); labels encode CL=0 and NON_CL=1.
    predictions = np.where(probabilities >= 0.5, 0, 1)
    cl_true = labels == 0
    non_cl_true = labels == 1
    tp = int(np.sum(cl_true & (predictions == 0)))
    fn = int(np.sum(cl_true & (predictions == 1)))
    tn = int(np.sum(non_cl_true & (predictions == 1)))
    fp = int(np.sum(non_cl_true & (predictions == 0)))
    return {
        "accuracy": float(accuracy_score(labels, predictions)),
        "balanced_accuracy": float(balanced_accuracy_score(labels, predictions)),
        "sensitivity_cl": tp / max(1, tp + fn),
        "specificity_non_cl": tn / max(1, tn + fp),
        "roc_auc_cl": float(roc_auc_score(cl_true.astype(int), probabilities)) if len(np.unique(cl_true)) == 2 else float("nan"),
        "tp": tp,
        "fn": fn,
        "tn": tn,
        "fp": fp,
        "test_images": int(len(labels)),
    }


def train_classifier(epochs: int, batch_size: int, device: torch.device) -> tuple[nn.Module, dict]:
    train_set = ClassificationDataset("train", augment=True)
    val_set = ClassificationDataset("val")
    test_set = ClassificationDataset("test")
    if not train_set.items or not val_set.items or not test_set.items:
        raise ValueError("Classifier train/val/test folders are incomplete; run prepare_dataset.py first")
    class_counts = np.bincount([label for _, label in train_set.items], minlength=2)
    if np.any(class_counts == 0):
        raise ValueError(f"Both classes need training examples, got {class_counts.tolist()}")
    sample_weights = [1.0 / class_counts[label] for _, label in train_set.items]
    sampler = WeightedRandomSampler(sample_weights, num_samples=len(sample_weights), replacement=True)
    train_loader = DataLoader(train_set, batch_size=batch_size, sampler=sampler, num_workers=0)
    val_loader = DataLoader(val_set, batch_size=batch_size, shuffle=False, num_workers=0)
    test_loader = DataLoader(test_set, batch_size=batch_size, shuffle=False, num_workers=0)

    weights = MobileNet_V3_Small_Weights.IMAGENET1K_V1
    model = mobilenet_v3_small(weights=weights)
    # Train only the small classification head in this first CPU baseline.
    for parameter in model.features.parameters():
        parameter.requires_grad = False
    final_layer = model.classifier[-1]
    model.classifier[-1] = nn.Linear(final_layer.in_features, 2)
    model.to(device)
    optimizer = torch.optim.AdamW((p for p in model.parameters() if p.requires_grad), lr=0.001, weight_decay=0.0001)
    criterion = nn.CrossEntropyLoss()
    best_accuracy = -1.0
    best_path = OUT / "classifier_best.pth"
    history = []

    for epoch in range(epochs):
        model.train()
        losses = []
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad(set_to_none=True)
            logits = model(images)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach().cpu()))
        labels, probabilities = classification_predictions(model, val_loader, device)
        validation = classification_metrics(labels, probabilities)
        row = {"epoch": epoch + 1, "train_loss": float(np.mean(losses)), "validation": validation}
        history.append(row)
        print(f"CLS epoch {epoch + 1}/{epochs}: loss={row['train_loss']:.4f}, val_bal_acc={validation['balanced_accuracy']:.4f}, val_auc={validation['roc_auc_cl']:.4f}", flush=True)
        if validation["balanced_accuracy"] > best_accuracy:
            best_accuracy = float(validation["balanced_accuracy"])
            torch.save(model.state_dict(), best_path)

    model.load_state_dict(torch.load(best_path, map_location=device, weights_only=True))
    labels, probabilities = classification_predictions(model, test_loader, device)
    test_metrics = classification_metrics(labels, probabilities)
    torch.save(model.state_dict(), OUT / "classifier.pth")
    return model, {"history": history, "test": test_metrics, "best_checkpoint": str(best_path)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seg-epochs", type=int, default=8)
    parser.add_argument("--cls-epochs", type=int, default=12)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--threads", type=int, default=2)
    args = parser.parse_args()
    if not (DATA / "manifest.json").exists():
        raise SystemExit("Prepared dataset not found; run prepare_dataset.py first")
    OUT.mkdir(parents=True, exist_ok=True)
    random.seed(42)
    np.random.seed(42)
    torch.manual_seed(42)
    torch.set_num_threads(args.threads)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on {device} with {torch.get_num_threads()} CPU threads", flush=True)

    _, segmentation = train_segmentation(args.seg_epochs, args.batch_size, device)
    _, classification = train_classifier(args.cls_epochs, args.batch_size * 2, device)
    report = {
        "device": str(device),
        "image_size": SIZE,
        "segmentation": segmentation,
        "classification": classification,
        "interpretation": "Exploratory metrics on source-held-out images. Not clinical validation; class and acquisition source are confounded, and box-only masks are approximate.",
    }
    (OUT / "metrics.json").write_text(json.dumps(report, indent=2, allow_nan=True), encoding="utf-8")
    print(json.dumps({"segmentation_test": segmentation["test"], "classification_test": classification["test"]}, indent=2), flush=True)
    print(f"Model weights and metrics saved to {OUT}", flush=True)


if __name__ == "__main__":
    main()
