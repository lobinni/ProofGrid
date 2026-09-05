#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[1/9] embed child source"
python3 contracts/generate_factory.py

echo "[2/9] compile Python"
python3 -m py_compile \
  contracts/task_factory.py \
  contracts/task_verifier.py \
  contracts/generate_factory.py \
  contracts/tests/genvm_stub.py \
  contracts/tests/test_proofgrid.py \
  scripts/prepare-contract-artifact.py \
  scripts/test-active-contracts.py
node --check scripts/record-deployment.mjs
node --check scripts/render-deployments.mjs
node --check scripts/studionet-e2e.mjs
node --check scripts/verify-deployment.mjs

echo "[3/9] test canonical contracts"
python3 contracts/tests/test_proofgrid.py

echo "[4/9] test exact deployed contracts"
python3 scripts/test-active-contracts.py

echo "[5/9] verify embedded source hashes"
node scripts/update-source-hashes.mjs

echo "[6/9] lint"
npm run lint

echo "[7/9] generate Next route types"
npx next typegen

echo "[8/9] TypeScript + production build"
npm exec tsc -- --noEmit --pretty false
npm run build

echo "[9/9] verify both live deployments"
node scripts/verify-deployment.mjs

echo "release gate passed"
