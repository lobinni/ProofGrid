#!/usr/bin/env python3
"""Regenerates task_factory.py by embedding the current task_verifier.py source
(base64-encoded, to sidestep any quoting collisions with the child's own
triple-quoted f-strings) as the TASK_VERIFIER_CODE_B64 constant.

Run this whenever contracts/task_verifier.py changes:
    python3 contracts/generate_factory.py
"""
import base64
import pathlib
import re

HERE = pathlib.Path(__file__).parent
VERIFIER_PATH = HERE / "task_verifier.py"
FACTORY_PATH = HERE / "task_factory.py"

verifier_source = VERIFIER_PATH.read_text()
encoded = base64.b64encode(verifier_source.encode("utf-8")).decode("ascii")

factory_source = FACTORY_PATH.read_text()
new_factory_source = re.sub(
    r'TASK_VERIFIER_CODE_B64 = "[^"]*"',
    f'TASK_VERIFIER_CODE_B64 = "{encoded}"',
    factory_source,
    count=1,
)

if f'TASK_VERIFIER_CODE_B64 = "{encoded}"' not in new_factory_source:
    raise SystemExit("TASK_VERIFIER_CODE_B64 marker not found in task_factory.py - nothing replaced")

if new_factory_source == factory_source:
    print(f"Already up to date ({len(verifier_source)} bytes embedded).")
else:
    FACTORY_PATH.write_text(new_factory_source)
    print(f"Embedded {len(verifier_source)} bytes of task_verifier.py ({len(encoded)} b64 chars) into task_factory.py")
