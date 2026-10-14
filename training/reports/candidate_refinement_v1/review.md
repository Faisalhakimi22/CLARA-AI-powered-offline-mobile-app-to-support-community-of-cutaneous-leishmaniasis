# Segmentation refinement validation review

Date: 2026-10-10. This review supports an engineering research upgrade, not patient-care readiness.

The candidate was selected at epoch 8 using balanced CL/mimic validation Dice. This independent pass evaluated the same 257 validation images, the unchanged classifier, and the existing app score band. No test image was opened or threshold tuned. Because validation selected the model, these results are not an independent generalization estimate.

| Validation measure | Original segmentation | Refined segmentation |
| --- | ---: | ---: |
| CL mean Dice, 32 images | 0.326 | 0.580 |
| NON_CL mean Dice, 225 images | 0.519 | 0.569 |
| All-image mean Dice | 0.495 | 0.570 |
| Empty-mask abstentions | 17 | 4 |
| Predicted-crop classification balanced accuracy at 0.5, nonempty masks only | 0.695 (240 images) | 0.811 (253 images) |
| Balanced fraction correctly classified at 0.5 over all cases, empty masks unresolved | 0.650 | 0.804 |

The classifier runs on predicted, masked image crops in this evaluation. The earlier annotation-crop results are not end-to-end model results. Pillow preprocessing mirrors the app's intended resizing, padding, component removal, crop, and gray-background pipeline; device runtime parity and performance require separate checks.

The unchanged app thresholds are CL score >0.8, NON_CL score <0.2, otherwise uncertain. Empty masks are also uncertain. These uncalibrated thresholds have not been clinically validated.

| True class | Original: CL / NON_CL / uncertain | Candidate: CL / NON_CL / uncertain |
| --- | --- | --- |
| CL (32 images) | 13 / 7 / 12 | 24 / 2 / 6 |
| NON_CL (225 images) | 20 / 132 / 73 | 20 / 139 / 66 |

Candidate decisive coverage is 185/257 (72.0%); 72 cases abstain, including four empty masks. Reporting accuracy only among decisive cases would hide those abstentions. Two CL validation images still receive a low-suspicion model output; all outputs must continue to require clinical review.

Visual review of `validation_grid_comparison_fixed.png` (four evenly spaced, fixed cases per class) confirms tighter CL localization in three of four examples. One CL example worsens slightly, and mimic cases remain inconsistent. `validation_grid_failures.png` deliberately displays the three lowest-Dice cases per class. Failures include missed lesions, outlining lips or background, and fragmented tiny lesions. Improved averages do not eliminate these failure modes.

Recommendation: promote the refined segmentation checkpoint with the unchanged classifier for supervised research testing, subject to ONNX numerical parity and app regression checks. Classifier finetuning is not necessary to pass this comparison. Clinical readiness still requires representative, independently diagnosed, patient-separated Pakistani data, annotation review, independent validation, calibrated operating thresholds, and prospective workflow evaluation.

Candidate SHA256: `11eee90cc6f4f82975601cb87dc41525833dc0c4067136bbb852baaebcafca37`

Original segmentation SHA256: `674257ac7c257e40931119b9d69b12f706600c59f120709a0d30a018f34faefe`

Machine-readable per-image results, counts, and BatchNorm audit: `validation.json`.

Reproduce from the project root:

```powershell
training\.venv\Scripts\python.exe training\diagnose_segmentation.py --segmentation-checkpoint training\candidates\segmentation_refinement_v1\segmentation.pth --output training\reports\candidate_refinement_v1 --baseline-report training\reports\baseline_diagnosis\validation.json --threads 2
```
