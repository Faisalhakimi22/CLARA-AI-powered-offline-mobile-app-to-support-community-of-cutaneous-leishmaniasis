# CLARA research model baseline

This folder contains a reproducible, local, two-stage research baseline inspired by the PLOS workflow:

1. DeepLabV3 with a MobileNetV3-Large backbone segments lesion regions.
2. MobileNetV3-Small classifies a masked lesion crop as `CL` or `NON_CL`.

The app runs the local ONNX model pair `clara-local-research-refined-v2` through `src/services/modelAdapter.ts`: refined segmentation from `candidates/segmentation_refinement_v1/segmentation.pth` and the unchanged original `models/classifier.pth`. Browser WebAssembly and native Android/iOS ONNX providers share preprocessing and result mapping. Native inference requires a custom build; Expo Go lacks the native runtime. This is a supervised research integration, not a clinical model deployment.

## Data preparation

`prepare_dataset.py` reads the CL records using only `CL_*.jpg` from the old mixed export directories, plus the scabies/mimic ZIP. It writes a separate `prepared/` tree and does not change the source exports. This deliberately avoids the broken `data.yaml` paths and the mixed parent folders.

Current prepared counts:

| Split      | Images | CL classifier images | Other-diagnosis images |
| ---------- | -----: | -------------------: | ---------------------: |
| Train      |    879 |                  114 |                    765 |
| Validation |    257 |                   32 |                    225 |
| Test       |    150 |                   15 |                    135 |

The two CL-export images that contain a conflicting class annotation are excluded. The mimic ZIP supplies atopic dermatitis, contact dermatitis, and scabies records; those source labels are mapped to `NON_CL`. This mapping must be checked against the dataset curator's class definitions before research use. Box-only mimic annotations are converted to rectangular pseudo-masks for the segmentation baseline and counted in `prepared/manifest.json`.

The mimic ZIP has no test split, so a fixed 15% stratified test holdout is reserved from its train split. No patient identifier is provided, therefore the split is image-level and cannot guarantee patient separation. The CL and non-CL data also come from different datasets and capture conditions. A classifier may learn source or skin-tone cues instead of disease features. The small CL test subset and weak rectangular masks make the reported metrics exploratory only.

## Environment and run

Python 3.14, PyTorch 2.13, and TorchVision 0.28 were used on this machine. It has CPU-only PyTorch and four CPU cores. Pretrained ImageNet/VOC weights are downloaded from TorchVision on first run. No Roboflow inference or paid cloud training is used.

The completed local baseline in `models/` was trained on CPU with 3 epochs per stage at 128×128. The segmentation backbone and image classifier feature extractor were frozen; only their output heads were fitted. This shortened the run enough for this four-core machine. Use the included Colab notebook for longer GPU experiments.

The **original baseline** held-out image-level test split reported segmentation Dice **0.604** and IoU **0.513**. Its classifier, evaluated on human-annotation crops, reported accuracy **0.853**, balanced accuracy **0.919**, CL sensitivity **1.00 (15/15)**, specificity **0.837 (113/135)**, and ROC-AUC **0.982**. These are not results for the refined model pair or the end-to-end app. They are highly preliminary: only 15 CL images are in the test set, all CL images come from a different source than the non-CL images, and patient-level independence is unknown. Do not interpret these as clinical performance estimates.

```powershell
python -m venv --system-site-packages training\.venv
training\.venv\Scripts\python.exe -m pip install --no-deps torchvision==0.28.0 --index-url https://download.pytorch.org/whl/cpu
python training\prepare_dataset.py --force
training\.venv\Scripts\python.exe training\train_models.py --seg-epochs 3 --cls-epochs 3 --batch-size 8 --threads 2
```

For Google Colab, open `CLARA_Colab_Training.ipynb`, select a T4 GPU runtime, upload `clara_colab_bundle.zip` when prompted, and run the cells. The bundle contains the prepared dataset and training script. Colab is a separate hosted session; it cannot be attached to the local app or machine. The notebook downloads the resulting model archive at the end.

`prepared/` contains clean segmentation images and labels, classifier lesion crops, a path-correct segmentation YAML, and a provenance/count manifest. `models/` contains the best segmentation checkpoint, the best classification checkpoint, and validation/test metrics. The test set is used once at the end of each training run; do not tune thresholds on it.

## Current segmentation refinement

The refined segmentation restores pretrained BatchNorm statistics and keeps the frozen backbone in evaluation mode, balances CL and mimic sampling, excludes training records containing box-derived pseudo-masks, and uses deterministic mirrored examples. Ten head-only epochs ran locally; epoch 8 was selected by the mean of CL and NON_CL validation Dice. The original PyTorch weights remain unchanged in `models/`. The previous deployed ONNX models, manifest, and conversion report are preserved in `models/baseline-v1/`.

An additional compatibility pass used all 257 validation images with the unchanged classifier and predicted masks:

| Validation result | Original segmentation | Refined segmentation |
| --- | ---: | ---: |
| CL mean Dice (32 images) | 0.326 | 0.580 |
| NON_CL mean Dice (225 images) | 0.519 | 0.569 |
| Classification balanced accuracy at score 0.5, nonempty masks | 0.695 (240 images) | 0.811 (253 images) |
| Empty-mask abstentions | 17 | 4 |

At the unchanged app review band (CL score >0.8, NON_CL score <0.2, otherwise uncertain), the refined model pair produced 24 suggestive, 2 low-suspicion, and 6 uncertain outputs among 32 CL cases; 20 suggestive, 139 low-suspicion, and 66 uncertain outputs among 225 NON_CL cases. Missing masks count as uncertain. The two low-suspicion outputs on CL cases demonstrate why this remains research-only. These validation data selected the candidate, so the comparison is not an independent test estimate. No test data were used to refine or select the replacement.

See `reports/candidate_refinement_v1/review.md`, `validation.json`, and `validation_grid_comparison_fixed.png` for the complete review and fixed visual comparison, including failure examples. Better average outlines do not eliminate missed lesions or background errors.

Re-export the selected pair with provenance and ONNX/PyTorch parity checks:

```powershell
training\.venv\Scripts\python.exe training\export_models.py --segmentation-weights training\candidates\segmentation_refinement_v1\segmentation.pth --model-id clara-local-research-refined-v2 --validation-report training\reports\candidate_refinement_v1\validation.json
```

This writes `assets/models/segmentation.onnx`, `classifier.onnx`, and `manifest.json`, plus `models/export_verification.json`. The manifest records source checkpoint hashes, validation report hash, preprocessing, and research limitations. Both exports must pass conversion checks before bundled models are replaced.

## Refined-v2 internal test evaluation

After validation-based selection and export, the refined pair was evaluated on the 150-image internal test split with fixed thresholds. Mean mask Dice was 0.671 (CL 0.672; NON_CL 0.671). Classification at score 0.5 using predicted masks had balanced accuracy 0.842 among 147 nonempty masks; three images abstained because no usable mask remained.

At the app's unchanged 0.2/0.8 review band, the 15 CL images produced 12 suggestive and 3 uncertain outputs. The 135 NON_CL images produced 13 suggestive, 89 low-suspicion, and 33 uncertain outputs, including empty masks. Overall, 36/150 outputs were uncertain. These counts must accompany any selective classification metrics.

See [the test review](reports/refined_v2_test/review.md), [complete results](reports/refined_v2_test/test.json), and [pre-evaluation lock](reports/refined_v2_test/test_evaluation_lock.json). This is an internal image-level evaluation with prior baseline test exposure, not an external or patient-independent validation. No test-based tuning followed this run.

## Safety and intended use

The original baseline classifier metrics used human-annotation crops. The refined-v2 report separately evaluates predicted-mask crops in the Python pipeline. Neither establishes performance on an Android phone or on patient-separated external data. ONNX exports were checked against PyTorch logits on deterministic tensors and a prepared image; numerical parity establishes conversion correctness only.

These are experimental weights for engineering and research discussion. They have not been externally validated, calibrated, evaluated on Pakistani clinical images, or reviewed for clinical use. Do not use their outputs to diagnose or manage a patient. Any real triage use requires an ethically approved, representative dataset with reliable clinical/laboratory reference diagnoses, patient-level split design, prospective external validation, and appropriate governance.

Source datasets are marked CC BY 4.0 in their export metadata. Preserve attribution to the original dataset owners and verify the source pages and terms before redistributing derived datasets or weights.
