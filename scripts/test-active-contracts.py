#!/usr/bin/env python3
"""Run the portable contract suite against every unique active source archive."""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = json.loads((ROOT / "deployments/deployments.json").read_text())
archives = sorted({
    item.get("sourceArchive")
    for item in MANIFEST["networks"].values()
    if item.get("activeFactory") and item.get("sourceArchive")
})
if not archives:
    print("no active source archives recorded", file=sys.stderr)
    raise SystemExit(1)

for archive in archives:
    source_dir = ROOT / archive
    if not source_dir.is_dir():
        print(f"missing active source archive: {source_dir}", file=sys.stderr)
        raise SystemExit(1)
    print(f"\n=== active source: {archive} ===")
    env = os.environ.copy()
    env["PROOFGRID_CONTRACT_DIR"] = str(source_dir)
    result = subprocess.run(
        [sys.executable, str(ROOT / "contracts/tests/test_proofgrid.py")],
        cwd=ROOT,
        env=env,
    )
    if result.returncode:
        raise SystemExit(result.returncode)

print(f"\nall {len(archives)} unique active source archive(s) passed")
