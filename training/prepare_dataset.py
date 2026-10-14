"""Build a clean PLOS-style two-stage dataset from the local Roboflow ZIP exports.

The source archives are read-only inputs. This script never reads the mixed folders at
data/train, data/valid, or data/test, which may contain files from multiple exports.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import shutil
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

import yaml
from PIL import Image, ImageDraw, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CL_SOURCE_ROOT = PROJECT_ROOT / "data"
MIMIC_ARCHIVE = PROJECT_ROOT / "data" / "New folder" / "scabies valid.v1i.yolo26.zip"
OUTPUT_ROOT = Path(__file__).resolve().parent / "prepared"
IMAGE_SIZE = 256
SEED = 42


@dataclass(frozen=True)
class Sample:
    source: str
    split: str
    name: str
    image: bytes
    regions: tuple[tuple[float, ...], ...]
    source_classes: tuple[int, ...]
    coarse_boxes: int = 0

    @property
    def stable_name(self) -> str:
        return f"{self.source}_{self.split}_{Path(self.name).stem}"


def parse_annotation(text: str, class_count: int, filename: str) -> tuple[list[tuple[float, ...]], list[int], int]:
    regions: list[tuple[float, ...]] = []
    classes: list[int] = []
    coarse_boxes = 0
    for row_number, line in enumerate(text.splitlines(), start=1):
        values = line.split()
        if not values:
            continue
        try:
            class_id = int(values[0])
            coords = tuple(float(value) for value in values[1:])
        except ValueError as exc:
            raise ValueError(f"Invalid annotation in {filename}:{row_number}") from exc
        if class_id < 0 or class_id >= class_count:
            raise ValueError(f"Class {class_id} is outside the declared classes in {filename}")
        if len(coords) == 4:
            # Detection-only YOLO rows (cx, cy, width, height) become an explicitly
            # coarse rectangular pseudo-mask for the segmentation baseline.
            cx, cy, width, height = coords
            coords = (
                cx - width / 2,
                cy - height / 2,
                cx + width / 2,
                cy - height / 2,
                cx + width / 2,
                cy + height / 2,
                cx - width / 2,
                cy + height / 2,
            )
            coarse_boxes += 1
        if len(coords) < 6 or len(coords) % 2:
            raise ValueError(f"Invalid polygon in {filename}:{row_number}")
        if any(not 0 <= value <= 1 for value in coords):
            raise ValueError(f"Coordinates outside 0..1 in {filename}:{row_number}")
        regions.append(coords)
        classes.append(class_id)
    return regions, classes, coarse_boxes


def load_archive(archive_path: Path, source: str) -> tuple[dict[str, object], list[Sample]]:
    if not archive_path.exists():
        raise FileNotFoundError(f"Dataset ZIP not found: {archive_path}")
    with zipfile.ZipFile(archive_path) as archive:
        yaml_member = next((name for name in archive.namelist() if PurePosixPath(name).name == "data.yaml"), None)
        if not yaml_member:
            raise ValueError(f"No data.yaml in {archive_path}")
        metadata = yaml.safe_load(archive.read(yaml_member))
        names = metadata.get("names")
        if isinstance(names, dict):
            class_count = len(names)
        elif isinstance(names, list):
            class_count = len(names)
        else:
            raise ValueError(f"Class names are missing from {archive_path}")

        images = {
            PurePosixPath(name).stem: name
            for name in archive.namelist()
            if "/images/" in name and PurePosixPath(name).suffix.lower() in {".jpg", ".jpeg", ".png"}
        }
        labels = {
            PurePosixPath(name).stem: name
            for name in archive.namelist()
            if "/labels/" in name and PurePosixPath(name).suffix.lower() == ".txt"
        }
        if set(images) != set(labels):
            missing_labels = sorted(set(images) - set(labels))[:5]
            orphan_labels = sorted(set(labels) - set(images))[:5]
            raise ValueError(
                f"Image/label mismatch in {archive_path}: missing={missing_labels}, orphan={orphan_labels}"
            )

        samples: list[Sample] = []
        for stem, image_member in images.items():
            image_path = PurePosixPath(image_member)
            split = image_path.parts[0]
            regions, classes, coarse = parse_annotation(
                archive.read(labels[stem]).decode("utf-8"), class_count, labels[stem]
            )
            if not regions:
                raise ValueError(f"Empty annotation: {labels[stem]}")
            samples.append(
                Sample(
                    source=source,
                    split=split,
                    name=image_path.name,
                    image=archive.read(image_member),
                    regions=tuple(regions),
                    source_classes=tuple(classes),
                    coarse_boxes=coarse,
                )
            )
    return metadata, samples


def load_cl_folder() -> tuple[dict[str, object], list[Sample]]:
    """Read only the original CL_ records from the mixed parent export folders."""
    metadata = yaml.safe_load((CL_SOURCE_ROOT / "data.yaml").read_text(encoding="utf-8"))
    names = metadata.get("names", [])
    class_count = len(names)
    samples: list[Sample] = []
    for split in ("train", "valid", "test"):
        image_dir = CL_SOURCE_ROOT / split / "images"
        label_dir = CL_SOURCE_ROOT / split / "labels"
        for image_path in sorted(image_dir.glob("CL_*.jpg")):
            label_path = label_dir / f"{image_path.stem}.txt"
            if not label_path.exists():
                raise ValueError(f"Missing CL label for {image_path}")
            regions, classes, coarse = parse_annotation(
                label_path.read_text(encoding="utf-8"), class_count, str(label_path)
            )
            if not regions:
                raise ValueError(f"Empty CL label: {label_path}")
            samples.append(
                Sample(
                    source="cl",
                    split=split,
                    name=image_path.name,
                    image=image_path.read_bytes(),
                    regions=tuple(regions),
                    source_classes=tuple(classes),
                    coarse_boxes=coarse,
                )
            )
    if len(samples) != 163:
        raise ValueError(f"Expected 163 CL_ samples, found {len(samples)}; inspect the source split")
    return metadata, samples


def split_mimics(samples: list[Sample]) -> dict[str, list[Sample]]:
    """Use the provided validation split and reserve a stratified test set from train."""
    original_train = [sample for sample in samples if sample.split == "train"]
    original_valid = [sample for sample in samples if sample.split in {"valid", "val"}]
    if not original_train or not original_valid:
        raise ValueError("The mimic export must contain train and validation images")
    groups: dict[int, list[Sample]] = defaultdict(list)
    for sample in original_train:
        majority_class = Counter(sample.source_classes).most_common(1)[0][0]
        groups[majority_class].append(sample)
    rng = random.Random(SEED)
    new_train: list[Sample] = []
    test: list[Sample] = []
    for class_id, class_samples in sorted(groups.items()):
        rng.shuffle(class_samples)
        held_out = max(1, round(len(class_samples) * 0.15))
        test.extend(class_samples[:held_out])
        new_train.extend(class_samples[held_out:])
    rng.shuffle(new_train)
    rng.shuffle(test)
    return {"train": new_train, "val": original_valid, "test": test}


def polygon_bbox(regions: tuple[tuple[float, ...], ...]) -> tuple[float, float, float, float]:
    xs = [region[index] for region in regions for index in range(0, len(region), 2)]
    ys = [region[index] for region in regions for index in range(1, len(region), 2)]
    return min(xs), min(ys), max(xs), max(ys)


def save_sample(
    sample: Sample,
    split: str,
    segmentation_root: Path,
    classifier_root: Path,
    disease_class: str,
) -> None:
    with Image.open(__import__("io").BytesIO(sample.image)) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
    width, height = image.size
    filename = sample.stable_name + ".jpg"

    output_image = segmentation_root / "images" / split / filename
    output_label = segmentation_root / "labels" / split / (sample.stable_name + ".txt")
    output_image.parent.mkdir(parents=True, exist_ok=True)
    output_label.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_image, quality=92)
    output_label.write_text(
        "".join("0 " + " ".join(f"{coordinate:.8f}" for coordinate in region) + "\n" for region in sample.regions),
        encoding="utf-8",
    )

    # Make a single masked lesion crop per image for classifier training, mirroring
    # stage one -> stage two while preventing images with many papules dominating.
    x1, y1, x2, y2 = polygon_bbox(sample.regions)
    pad_x = max(0.04, (x2 - x1) * 0.25)
    pad_y = max(0.04, (y2 - y1) * 0.25)
    left = max(0, int((x1 - pad_x) * width))
    top = max(0, int((y1 - pad_y) * height))
    right = min(width, max(left + 1, int((x2 + pad_x) * width)))
    bottom = min(height, max(top + 1, int((y2 + pad_y) * height)))
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    for region in sample.regions:
        points = [(region[index] * width, region[index + 1] * height) for index in range(0, len(region), 2)]
        draw.polygon(points, fill=255)
    neutral = Image.new("RGB", image.size, (120, 120, 120))
    neutral.paste(image, mask=mask)
    crop = neutral.crop((left, top, right, bottom)).resize((IMAGE_SIZE, IMAGE_SIZE), Image.Resampling.BILINEAR)
    classifier_image = classifier_root / split / disease_class / filename
    classifier_image.parent.mkdir(parents=True, exist_ok=True)
    crop.save(classifier_image, quality=92)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Replace the generated prepared/ directory")
    args = parser.parse_args()
    if OUTPUT_ROOT.exists():
        if not args.force:
            raise SystemExit(f"{OUTPUT_ROOT} exists; pass --force to regenerate it")
        shutil.rmtree(OUTPUT_ROOT)

    cl_meta, cl_samples = load_cl_folder()
    mimic_meta, mimic_samples = load_archive(MIMIC_ARCHIVE, "mimic")

    # Conflicting image-level classes in the CL export cannot safely be assigned a
    # CL diagnosis. Exclude those whole images from both training stages.
    conflicts = [sample for sample in cl_samples if len(set(sample.source_classes)) > 1 or 1 in sample.source_classes]
    cl_samples = [sample for sample in cl_samples if sample not in conflicts]
    cl_by_split = {
        "train": [sample for sample in cl_samples if sample.split == "train"],
        "val": [sample for sample in cl_samples if sample.split in {"valid", "val"}],
        "test": [sample for sample in cl_samples if sample.split == "test"],
    }
    mimic_by_split = split_mimics(mimic_samples)

    # Detect exact duplicates across the two source archives before assigning binary
    # labels; duplicate disease images with opposing labels would invalidate results.
    cl_hashes = {hashlib.sha256(sample.image).hexdigest() for sample in cl_samples}
    mimic_hashes = {hashlib.sha256(sample.image).hexdigest() for sample in mimic_samples}
    overlaps = cl_hashes & mimic_hashes
    if overlaps:
        raise ValueError(f"Found {len(overlaps)} exact cross-dataset image duplicates; resolve labels before training")

    segmentation_root = OUTPUT_ROOT / "segmentation"
    classifier_root = OUTPUT_ROOT / "classification"
    segmentation_counts: dict[str, int] = {}
    classification_counts: dict[str, Counter[str]] = {}
    coarse_box_counts: Counter[str] = Counter()

    for split in ("train", "val", "test"):
        samples = cl_by_split[split] + mimic_by_split[split]
        segmentation_counts[split] = len(samples)
        classification_counts[split] = Counter()
        for sample in samples:
            disease_class = "CL" if sample.source == "cl" else "NON_CL"
            save_sample(sample, split, segmentation_root, classifier_root, disease_class)
            classification_counts[split][disease_class] += 1
            coarse_box_counts[split] += sample.coarse_boxes if sample.source == "mimic" else 0

    # Absolute path makes the generated dataset independent of Roboflow's ../ paths
    # and the contaminated parent data/ tree.
    segmentation_yaml = {
        "path": OUTPUT_ROOT.resolve().as_posix(),
        "train": "segmentation/images/train",
        "val": "segmentation/images/val",
        "test": "segmentation/images/test",
        "nc": 1,
        "names": ["lesion"],
    }
    (segmentation_root / "data.yaml").write_text(yaml.safe_dump(segmentation_yaml, sort_keys=False), encoding="utf-8")

    manifest = {
        "seed": SEED,
        "image_size_for_classifier": IMAGE_SIZE,
        "sources": [
            {
                "source_folder": str(CL_SOURCE_ROOT.relative_to(PROJECT_ROOT)),
                "selection": "Only CL_*.jpg records from the original three splits",
                "license": "CC BY 4.0 (source export metadata)",
                "classes": cl_meta.get("names"),
                "source_url": cl_meta.get("roboflow", {}).get("url"),
            },
            {
                "archive": str(MIMIC_ARCHIVE.relative_to(PROJECT_ROOT)),
                "license": "CC BY 4.0 (source export metadata)",
                "classes": mimic_meta.get("names"),
                "source_url": mimic_meta.get("roboflow", {}).get("url"),
                "class_mapping_inferred_from_filenames": {
                    "DA": "atopic dermatitis (atopi filenames)",
                    "DK": "contact dermatitis (kontak filenames)",
                    "SK": "scabies (scabies/Sarna filenames)",
                },
            },
        ],
        "binary_classifier_classes": {"CL": "class 0 in CL source export", "NON_CL": "all three mimic export classes"},
        "split_counts": {
            split: {
                "segmentation_images": segmentation_counts[split],
                "classifier_images": dict(classification_counts[split]),
                "coarse_box_pseudo_masks": coarse_box_counts[split],
            }
            for split in ("train", "val", "test")
        },
        "excluded_conflicting_cl_images": [sample.name for sample in conflicts],
        "mimic_test_set": "15% stratified holdout from source train; source validation is retained as val",
        "limitations": [
            "The source datasets may not provide verified patient-level diagnostic adjudication.",
            "The mimic archive has no patient IDs; split independence is by image filename, not patient.",
            "CL and non-CL sources differ by origin and acquisition style, so source shortcuts may dominate.",
            "Box-only lesions were converted to rectangular pseudo-masks for segmentation.",
            "This is a research prototype and is not suitable for clinical decisions.",
        ],
    }
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    (OUTPUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest["split_counts"], indent=2))
    print(f"Excluded conflicting CL images: {[sample.name for sample in conflicts]}")
    print(f"Prepared dataset: {OUTPUT_ROOT}")


if __name__ == "__main__":
    main()
