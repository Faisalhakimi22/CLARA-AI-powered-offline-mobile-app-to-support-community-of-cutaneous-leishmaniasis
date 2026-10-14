"""Export the existing research checkpoints for offline CLARA inference.

No training, remote inference, or patient-image upload occurs here. Run after
train_models.py. Install onnx and onnxruntime into the training environment.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
import torchvision
from PIL import Image
from torch import nn
from torchvision.models import mobilenet_v3_small
from torchvision.models.segmentation import deeplabv3_mobilenet_v3_large

from train_models import DATA, MEAN, OUT, SIZE, STD, letterbox, tensor_image


class SegmentationLogits(nn.Module):
    """Export only the final mask logits, excluding the unused auxiliary head."""

    def __init__(self, model: nn.Module) -> None:
        super().__init__()
        self.model = model

    def forward(self, image: torch.Tensor) -> torch.Tensor:
        return self.model(image)["out"]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_models(segmentation_weights: Path = OUT / "segmentation.pth") -> dict[str, nn.Module]:
    # Explicitly disable both sets of pretrained downloads: the local checkpoints
    # contain every required parameter, including their trained batch statistics.
    segmentation = deeplabv3_mobilenet_v3_large(
        weights=None, weights_backbone=None, aux_loss=True
    )
    segmentation.classifier[-1] = nn.Conv2d(
        segmentation.classifier[-1].in_channels, 1, kernel_size=1
    )
    segmentation.load_state_dict(
        torch.load(segmentation_weights, map_location="cpu", weights_only=True)
    )
    classifier = mobilenet_v3_small(weights=None)
    classifier.classifier[-1] = nn.Linear(classifier.classifier[-1].in_features, 2)
    classifier.load_state_dict(
        torch.load(OUT / "classifier.pth", map_location="cpu", weights_only=True)
    )
    return {
        "segmentation": SegmentationLogits(segmentation).eval(),
        "classifier": classifier.eval(),
    }


def representative_inputs(name: str) -> list[tuple[str, torch.Tensor]]:
    generator = torch.Generator().manual_seed(4217)
    inputs = [("deterministic_random_tensor", torch.randn(1, 3, SIZE, SIZE, generator=generator))]
    if name == "segmentation":
        candidates = sorted((DATA / "segmentation" / "images" / "val").glob("*.jpg"))
        for path in candidates[:1]:
            image = letterbox(Image.open(path).convert("RGB"), SIZE)
            inputs.append((f"prepared_validation_image:{path.name}", tensor_image(image).unsqueeze(0)))
    else:
        for label in ("CL", "NON_CL"):
            candidates = sorted((DATA / "classification" / "val" / label).glob("*.jpg"))
            for path in candidates[:1]:
                image = Image.open(path).convert("RGB").resize((SIZE, SIZE), Image.Resampling.BILINEAR)
                inputs.append((f"prepared_validation_crop:{label}/{path.name}", tensor_image(image).unsqueeze(0)))
    if len(inputs) < 2:
        raise ValueError(f"No prepared validation input for {name}; prepare the dataset first")
    return inputs


def export_and_verify(name: str, model: nn.Module, destination: Path, checkpoint: Path) -> dict:
    path = destination / f"{name}.onnx"
    inputs = representative_inputs(name)
    with torch.inference_mode():
        # A fixed image shape and opset 17 are intentional for the mobile/web
        # runtimes. Store all weights in a single bundled asset. The legacy
        # exporter remains supported and avoids requiring a separate data file.
        torch.onnx.export(
            model,
            (inputs[0][1],),
            str(path),
            input_names=["image"],
            output_names=["logits"],
            opset_version=17,
            dynamo=False,
            export_params=True,
            do_constant_folding=True,
        )
    exported = onnx.load(str(path))
    onnx.checker.check_model(exported, full_check=True)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    session = ort.InferenceSession(str(path), sess_options=options, providers=["CPUExecutionProvider"])
    checks = []
    for source, image in inputs:
        with torch.inference_mode():
            expected = model(image).numpy()
        actual = session.run(["logits"], {"image": image.numpy()})[0]
        np.testing.assert_allclose(actual, expected, rtol=1e-4, atol=1e-4)
        checks.append({
            "input": source,
            "output_shape": list(actual.shape),
            "max_absolute_logit_difference": float(np.max(np.abs(actual - expected))),
            "mean_absolute_logit_difference": float(np.mean(np.abs(actual - expected))),
            "allclose_atol": 1e-4,
            "allclose_rtol": 1e-4,
            "passed": True,
        })
    return {
        "filename": path.name,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "source_checkpoint_sha256": sha256(checkpoint),
        "opset": 17,
        "ir_version": exported.ir_version,
        "input": {"name": "image", "shape": [1, 3, SIZE, SIZE], "type": "float32", "layout": "NCHW"},
        "output": {"name": "logits", "shape": list(session.get_outputs()[0].shape), "type": "float32"},
        "pytorch_onnx_parity_checks": checks,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "assets" / "models")
    parser.add_argument("--segmentation-weights", type=Path, default=OUT / "segmentation.pth")
    parser.add_argument("--model-id", default="clara-local-research-baseline-v1")
    parser.add_argument("--validation-report", type=Path, default=None)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(2)
    validation = None
    if args.validation_report:
        validation = json.loads(args.validation_report.read_text(encoding="utf-8"))
        if validation["segmentation_checkpoint_sha256"] != sha256(args.segmentation_weights):
            raise ValueError("Validation report does not match the selected segmentation checkpoint")
    # Keep the currently bundled models intact unless both exported files pass.
    with tempfile.TemporaryDirectory(prefix="clara-export-") as temporary:
        staging = Path(temporary)
        checkpoints = {"segmentation": args.segmentation_weights, "classifier": OUT / "classifier.pth"}
        models = {name: export_and_verify(name, model, staging, checkpoints[name])
                  for name, model in load_models(args.segmentation_weights).items()}
        for name in models:
            shutil.copy2(staging / f"{name}.onnx", args.output / f"{name}.onnx")
    manifest = {
        "id": args.model_id,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "intended_use": "Offline research triage evaluation; not a confirmed diagnosis or clinically validated release",
        "versions": {"torch": torch.__version__, "torchvision": torchvision.__version__, "onnx": onnx.__version__, "onnxruntime": ort.__version__},
        "normalization": {"color": "RGB", "scale": 255.0, "mean": list(MEAN), "std": list(STD), "formula": "(channel / 255 - mean[channel]) / std[channel]"},
        "segmentation_preprocessing": {"resize": "aspect_preserving_letterbox", "interpolation": "bilinear", "size": SIZE, "padding_rgb": [114, 114, 114]},
        "segmentation_postprocessing": {"activation": "sigmoid", "mask_threshold": 0.5, "coordinates": "Remove letterbox padding before mapping the mask to the original image"},
        "classifier_preprocessing": {"input": "Lesion mask applied to original RGB image, then padded bounding crop", "outside_mask_rgb": [120, 120, 120], "padding_per_axis": "max(0.04 * full image dimension, 0.25 * lesion bounding box dimension)", "resize": "stretch", "interpolation": "bilinear", "size": SIZE},
        "classifier_postprocessing": {"activation": "softmax", "classes": ["CL", "NON_CL"], "note": "Uncalibrated model scores; the app must not present them as clinical probabilities"},
        "models": models,
        "limitations": [
            "CL and non-CL images originate from different source datasets; acquisition source is confounded with disease class.",
            "Patient identities and patient-level separation are unverified.",
            "Some segmentation masks are rectangular approximations converted from bounding boxes.",
            "Only 15 CL images are present in the held-out test split.",
            "The classifier was trained with annotation-derived crops; validation with predicted masks is not independent clinical evaluation.",
            "No calibration, prospective clinical evaluation, or device-specific validation has been completed.",
            "ONNX parity checks verify model conversion only, not medical accuracy."
        ],
    }
    if validation is not None:
        report_path = args.validation_report.resolve()
        project_root = Path(__file__).resolve().parents[1]
        manifest["validation_review"] = {
            "report": report_path.relative_to(project_root).as_posix() if report_path.is_relative_to(project_root) else report_path.name,
            "report_sha256": sha256(args.validation_report),
            "segmentation_checkpoint_sha256": sha256(args.segmentation_weights),
            "model_selection": "Segmentation selected using balanced CL/NON_CL validation Dice. These validation results are not an independent test estimate. No test data used for refinement or promotion.",
            "segmentation": validation["segmentation"],
            "classification_predicted_masks": validation["classification_predicted_masks_validation"],
            "triage_with_abstentions": validation["triage_with_abstentions"],
            "approval_scope": "Supervised research integration only; not approved for patient-care decisions.",
        }
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    report = {
        "status": "passed",
        "model_id": args.model_id,
        "models": models,
        "scope": "CPU ONNX Runtime outputs match the PyTorch checkpoints on deterministic tensors and prepared validation inputs. This does not validate disease prediction accuracy or mobile app preprocessing.",
    }
    (OUT / "export_verification.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "models": {key: {"bytes": value["bytes"], "sha256": value["sha256"]} for key, value in models.items()}, "verification": "passed"}, indent=2))


if __name__ == "__main__":
    main()
