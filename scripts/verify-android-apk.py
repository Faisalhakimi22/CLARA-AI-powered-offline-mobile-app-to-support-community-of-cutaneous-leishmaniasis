#!/usr/bin/env python3
"""Check CLARA's offline APK contents and arm64 ELF layout without extracting it.

This does not replace apksigner, zipalign, or an installed-device inference test.
Only the Python standard library is required.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import struct
import sys
from typing import BinaryIO
import zipfile


PAGE_SIZE = 16384
ARM64_PREFIX = "lib/arm64-v8a/"
DEFAULT_MANIFEST = Path(__file__).resolve().parent.parent / "assets/models/manifest.json"


def sha256_stream(stream: BinaryIO) -> str:
    digest = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b""):
        digest.update(block)
    return digest.hexdigest()


def inspect_elf64(stream: BinaryIO, file_size: int) -> dict:
    """Inspect ELF headers only; do not load or execute the shared library."""
    result = {"passed": False, "load_segments": [], "errors": []}
    errors = result["errors"]
    header = stream.read(64)
    if len(header) != 64 or header[:4] != b"\x7fELF":
        errors.append("Missing or truncated ELF64 header")
        return result
    if header[4] != 2 or header[5] != 1 or header[6] != 1:
        errors.append("Expected ELF64, little-endian, ELF version 1 for Android arm64")
        return result
    fields = struct.unpack("<16sHHIQQQIHHHHHH", header)
    _, elf_type, machine, version, _, phoff, _, _, ehsize, phentsize, phnum, _, _, _ = fields
    if elf_type != 3 or machine != 183 or version != 1:
        errors.append("Expected an AArch64 ET_DYN shared library")
    if ehsize != 64:
        errors.append(f"Unexpected ELF64 header size: {ehsize}")
    if phnum == 65535:
        errors.append("Extended program-header counts are not supported by this verifier")
        return result
    if phnum == 0 or phentsize < 56 or phoff < 64:
        errors.append("Missing or invalid ELF64 program-header table")
        return result
    if phoff + phentsize * phnum > file_size:
        errors.append("Program-header table extends beyond the library bytes")
        return result

    for index in range(phnum):
        stream.seek(phoff + index * phentsize)
        raw = stream.read(56)
        if len(raw) != 56:
            errors.append(f"Program header {index} is truncated")
            break
        kind, flags, offset, vaddr, _, filesz, memsz, alignment = struct.unpack("<IIQQQQQQ", raw)
        if kind != 1:  # PT_LOAD
            continue
        segment_errors = []
        if alignment < PAGE_SIZE or alignment & (alignment - 1):
            segment_errors.append(f"p_align {alignment:#x} must be a power of two >= 0x4000")
        if offset % PAGE_SIZE != vaddr % PAGE_SIZE:
            segment_errors.append("p_offset and p_vaddr are not congruent modulo 16 KB")
        if alignment > 1 and offset % alignment != vaddr % alignment:
            segment_errors.append("p_offset and p_vaddr are not congruent modulo p_align")
        if filesz > memsz:
            segment_errors.append("p_filesz exceeds p_memsz")
        if offset + filesz > file_size:
            segment_errors.append("Load segment extends beyond the library bytes")
        result["load_segments"].append(
            {
                "program_header_index": index,
                "flags": flags,
                "offset": offset,
                "virtual_address": vaddr,
                "file_size": filesz,
                "memory_size": memsz,
                "alignment": alignment,
                "alignment_hex": hex(alignment),
                "offset_mod_16kb": offset % PAGE_SIZE,
                "virtual_address_mod_16kb": vaddr % PAGE_SIZE,
                "passed": not segment_errors,
                "errors": segment_errors,
            }
        )
        errors.extend(f"PT_LOAD {index}: {error}" for error in segment_errors)
    if not result["load_segments"]:
        errors.append("No PT_LOAD segments found")
    result["passed"] = not errors
    return result


def expected_models(manifest: dict) -> dict:
    if not isinstance(manifest, dict) or not isinstance(manifest.get("models"), dict):
        raise ValueError("Model manifest must contain a models object")
    expected = {}
    for stage in ("segmentation", "classifier"):
        model = manifest["models"].get(stage)
        if not isinstance(model, dict):
            raise ValueError(f"Manifest is missing models.{stage}")
        size, digest = model.get("bytes"), model.get("sha256")
        if type(size) is not int or size <= 0:
            raise ValueError(f"Manifest models.{stage}.bytes must be a positive integer")
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", digest):
            raise ValueError(f"Manifest models.{stage}.sha256 is invalid")
        expected[stage] = {"bytes": size, "sha256": digest.lower()}
    return expected


def verify_archive(archive: zipfile.ZipFile, manifest: dict) -> dict:
    """Return evidence from an open ZIP, also usable with in-memory test fixtures."""
    expected = expected_models(manifest)
    report = {
        "passed": False,
        "model_id": manifest.get("id"),
        "models": {},
        "javascript_bundles": [],
        "required_native_libraries": {},
        "arm64_libraries": [],
        "failures": [],
        "warnings": [],
    }
    failures, warnings = report["failures"], report["warnings"]
    members = [entry for entry in archive.infolist() if not entry.is_dir()]
    duplicates = [name for name, count in Counter(entry.filename for entry in members).items() if count > 1]
    if duplicates:
        failures.append("Duplicate ZIP member names: " + ", ".join(duplicates))

    # Android resource processing can rename ONNX assets under res/raw. Match
    # actual contents, not filenames. Size candidates also cover removed suffixes.
    expected_sizes = {model["bytes"] for model in expected.values()}
    candidates = []
    for entry in members:
        if entry.filename.lower().endswith(".onnx") or entry.file_size in expected_sizes:
            with archive.open(entry) as stream:
                digest = sha256_stream(stream)
            candidates.append({"member": entry.filename, "bytes": entry.file_size, "sha256": digest})
    for stage, model in expected.items():
        matches = [candidate for candidate in candidates if candidate["bytes"] == model["bytes"] and candidate["sha256"] == model["sha256"]]
        report["models"][stage] = {"passed": bool(matches), "expected": model, "matches": matches}
        if not matches:
            failures.append(f"Bundled {stage} ONNX matching manifest bytes/SHA-256 was not found")
        elif len(matches) > 1:
            warnings.append(f"{stage} is bundled {len(matches)} times with identical matching bytes")
    report["model_candidates"] = candidates
    known_hashes = {model["sha256"] for model in expected.values()}
    for candidate in candidates:
        if candidate["member"].lower().endswith(".onnx") and candidate["sha256"] not in known_hashes:
            warnings.append(f"Additional ONNX asset does not match this manifest: {candidate['member']}")

    report["javascript_bundles"] = [
        {"member": entry.filename, "bytes": entry.file_size}
        for entry in members
        if entry.filename.startswith("assets/")
        and entry.filename.lower().endswith((".bundle", ".jsbundle", ".hbc"))
        and entry.file_size > 0
    ]
    if not report["javascript_bundles"]:
        failures.append("No nonempty packaged JavaScript/Hermes bundle found under assets/")

    libraries = [entry for entry in members if entry.filename.startswith(ARM64_PREFIX) and entry.filename.endswith(".so")]
    library_names = {
        PurePosixPath(entry.filename).name
        for entry in libraries
        if str(PurePosixPath(entry.filename).parent) == ARM64_PREFIX.rstrip("/")
    }
    required = {
        "onnxruntime": ("libonnxruntime.so",),
        "onnxruntimejsi": ("libonnxruntimejsi.so",),
        "react_native": ("libreactnative.so", "libreactnativejni.so"),
    }
    for label, alternatives in required.items():
        found = sorted(library_names.intersection(alternatives))
        report["required_native_libraries"][label] = {"passed": bool(found), "members": [ARM64_PREFIX + name for name in found]}
        if not found:
            failures.append(f"Required arm64 {label} native library is missing ({' or '.join(alternatives)})")
    if not libraries:
        failures.append("No lib/arm64-v8a/*.so libraries found")
    for entry in libraries:
        with archive.open(entry) as stream:
            result = inspect_elf64(stream, entry.file_size)
        result.update({"member": entry.filename, "bytes": entry.file_size})
        report["arm64_libraries"].append(result)
        if not result["passed"]:
            failures.append(f"{entry.filename}: " + "; ".join(result["errors"]))
    report["passed"] = not failures
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path, help="Signed APK to inspect (not modified)")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST, help="Expected model manifest (default: project assets/models/manifest.json)")
    parser.add_argument("--output", type=Path, help="Write verification evidence as JSON")
    args = parser.parse_args()
    apk_path, manifest_path = args.apk.resolve(), args.manifest.resolve()
    # Do not let an evidence path overwrite either input.
    if args.output and args.output.resolve() in (apk_path, manifest_path):
        parser.error("--output must differ from the APK and manifest input paths")
    report = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "scope": "APK model bundling and arm64 ELF layout only; not a signature, ZIP alignment, device-runtime, or clinical validation result",
        "apk": str(apk_path),
        "manifest": str(manifest_path),
        "passed": False,
        "failures": [],
        "warnings": [],
    }
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
        with apk_path.open("rb") as stream:
            report["apk_sha256"] = sha256_stream(stream)
        report["apk_bytes"] = apk_path.stat().st_size
        with zipfile.ZipFile(apk_path) as archive:
            report.update(verify_archive(archive, manifest))
    except (OSError, ValueError, KeyError, RuntimeError, struct.error, zipfile.BadZipFile, NotImplementedError) as error:
        report["passed"] = False
        report["failures"].append(f"Could not complete APK verification: {error}")

    print(f"{'PASS' if report['passed'] else 'FAIL'}: CLARA APK static verification")
    print(f"APK: {apk_path}")
    for stage, model in report.get("models", {}).items():
        print(f"  {stage}: {'PASS' if model['passed'] else 'FAIL'} manifest bytes/SHA-256")
        for match in model["matches"]:
            print(f"    {match['member']}")
    bundles = report.get("javascript_bundles", [])
    print(f"  JS/Hermes bundles: {len(bundles)}")
    libraries = report.get("arm64_libraries", [])
    print(f"  ARM64 ELF 16 KB layout: {sum(lib['passed'] for lib in libraries)}/{len(libraries)} libraries passed")
    for warning in report["warnings"]:
        print(f"WARNING: {warning}")
    for failure in report["failures"]:
        print(f"ERROR: {failure}", file=sys.stderr)
    if args.output:
        try:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
            print(f"Evidence: {args.output.resolve()}")
        except OSError as error:
            print(f"ERROR: Could not save verification evidence: {error}", file=sys.stderr)
            return 1
    print("Device inference, apksigner, and zipalign checks remain separate.")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
