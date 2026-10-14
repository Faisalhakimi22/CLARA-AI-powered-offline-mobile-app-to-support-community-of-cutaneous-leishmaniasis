# Refined-v2 internal test review - 13 October 2026

The selected `clara-local-research-refined-v2` pair completed its internal test evaluation on 150 images: 15 CL and 135 NON_CL. This measures the research pipeline on an image-level split; it does not establish clinical performance or native Android runtime behavior.

The refined segmentation checkpoint was selected on validation data and exported before this evaluation. The classifier and thresholds were unchanged. [The evaluation lock](test_evaluation_lock.json) records checkpoint, export, and script hashes before inference. [The complete results](test.json) contain every image's scores. No test-based training, threshold tuning, or model selection followed this run.

## Segmentation and classification

| Measure | Result |
| --- | ---: |
| Mean mask Dice, all 150 images | 0.671 |
| Mean mask IoU, all 150 images | 0.582 |
| Mean mask Dice, 15 CL images | 0.672 |
| Mean mask Dice, 135 NON_CL images | 0.671 |
| Mean Dice after app-style component filtering | 0.671 |
| Empty masks after filtering | 3 / 150 |
| Classification balanced accuracy at score 0.5, 147 nonempty masks | 0.842 |
| Classification CL sensitivity at score 0.5, nonempty masks | 13 / 15 |
| Classification NON_CL specificity at score 0.5, nonempty masks | 108 / 132 |

Classification here uses automatically predicted masks, implemented in the Python evaluation pipeline with app-style postprocessing and cropping. It is separate from browser workflow checks and phone tests. The 0.5 classification threshold is a reporting measure; the app uses the wider review band below. Human-annotation crop metrics in the JSON are a reference comparison and must not be reported as automatic pipeline performance.

## App review band, including uncertain outputs

The fixed rules are: CL score greater than 0.8 suggests CL; below 0.2 indicates low suspicion; scores from 0.2 through 0.8 or an empty mask produce an uncertain result. Scores remain uncalibrated.

| Reference label | Suggestive of CL | Low suspicion | Uncertain score | Empty mask |
| --- | ---: | ---: | ---: | ---: |
| CL (15) | 12 | 0 | 3 | 0 |
| NON_CL (135) | 13 | 89 | 30 | 3 |

There were **36 uncertain outputs out of 150**, including the three empty masks. The remaining 114 outputs represent 76% coverage. Reporting sensitivity only among decisive outputs would exclude three CL cases and give a misleading impression of complete detection. Zero low-suspicion outputs among just 15 CL test images does not establish safe thresholds: the model-selection validation split had two low-suspicion outputs among 32 CL images.

## Remaining failures and limits

[Fixed examples](test_grid_fixed.png) and [failure examples](test_grid_failures.png) show remaining partial or missed lesions, oversized outlines, and incorrect background localization. Eighteen masks had Dice below 0.2. Four test annotations are rectangular pseudo-masks; their mean Dice was 0.247, versus 0.683 for the 146 polygon-annotated images. Annotation quality needs review before interpreting these values as lesion-boundary accuracy.

Patient identities and separation are unverified. CL and NON_CL acquisition sources differ, creating disease/source confounding. These are not independently diagnosed, representative Pakistani clinical cases. The original baseline had already been evaluated on this split, and one CL test photograph had been used for UI smoke testing. This is therefore an internal evaluation, not a pristine external holdout.

The improved model remains suitable for engineering and supervised research testing only. Patient-care use still requires reliable reference diagnoses, patient-separated external evaluation, calibration, clinical review, and appropriate data governance. There is no trained clinical-fusion model; the health worker records the final decision.

## Recorded invocation

```powershell
training\.venv\Scripts\python.exe training\diagnose_segmentation.py --split test --segmentation-checkpoint training\candidates\segmentation_refinement_v1\segmentation.pth --output training\reports\refined_v2_test --threads 2
```

This completed on CPU in approximately 24 seconds. The script refuses to overwrite the existing test lock or report; retain these artifacts rather than rerunning the test to choose settings.
