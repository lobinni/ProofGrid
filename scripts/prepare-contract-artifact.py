#!/usr/bin/env python3
"""Prepare a network-specific deployment artefact without mutating source.

Studionet:
    python3 scripts/prepare-contract-artifact.py --network studionet

Bradbury (paste the pinned py-genlayer runner from its Studio template):
    python3 scripts/prepare-contract-artifact.py \
        --network bradbury --runner 1abc...network-runner-hash

Output:
    dist/contracts/<network>/task_verifier.py
    dist/contracts/<network>/task_factory.py
    dist/contracts/<network>/source-hashes.json

The child is patched first, then byte-for-byte base64 embedded in the factory.
The printed factory sha256 is the source hash to record beside the deployment.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "contracts"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def set_runner(source: str, runner: str) -> str:
    replacement = f'# {{ "Depends": "py-genlayer:{runner}" }}'
    patched, count = re.subn(
        r'^# \{ "Depends": "py-genlayer:[^"]+" \}',
        replacement,
        source,
        count=1,
        flags=re.MULTILINE,
    )
    if count != 1:
        raise SystemExit("could not locate py-genlayer Depends header")
    return patched


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--network", choices=("studionet", "bradbury"), required=True)
    parser.add_argument(
        "--runner",
        help="Optional pinned py-genlayer hash override; omitted = preserve current deployed header",
    )
    args = parser.parse_args()

    out = ROOT / "dist" / "contracts" / args.network
    out.mkdir(parents=True, exist_ok=True)

    # Read bytes so CRLF/LF style remains part of the reproducible source hash.
    verifier = (SOURCE / "task_verifier.py").read_bytes().decode("utf-8")
    factory = (SOURCE / "task_factory.py").read_bytes().decode("utf-8")
    if args.runner:
        verifier = set_runner(verifier, args.runner)
        factory = set_runner(factory, args.runner)
    runner_match = re.search(r'^# \{ "Depends": "py-genlayer:([^"]+)" \}', verifier, re.MULTILINE)
    if not runner_match:
        raise SystemExit("could not read py-genlayer runner from source")
    runner = runner_match.group(1)
    encoded = base64.b64encode(verifier.encode()).decode()
    factory, count = re.subn(
        r'TASK_VERIFIER_CODE_B64 = "[^"]*"',
        f'TASK_VERIFIER_CODE_B64 = "{encoded}"',
        factory,
        count=1,
    )
    if count != 1:
        raise SystemExit("TASK_VERIFIER_CODE_B64 marker not found")

    (out / "task_verifier.py").write_text(verifier)
    (out / "task_factory.py").write_text(factory)

    hashes = {
        "network": args.network,
        "runner": runner,
        "factorySha256": sha256(factory.encode()),
        "verifierSha256": sha256(verifier.encode()),
        "embeddedVerifierSha256": sha256(base64.b64decode(encoded)),
        "embeddedVerifierMatches": base64.b64decode(encoded).decode() == verifier,
    }
    (out / "source-hashes.json").write_text(json.dumps(hashes, indent=2) + "\n")
    print(json.dumps(hashes, indent=2))
    print(f"\nDeploy: {out / 'task_factory.py'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
