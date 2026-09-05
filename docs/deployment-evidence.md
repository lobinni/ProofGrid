# Deployment evidence

## Active factories

| Network | Chain | Address | Source SHA-256 |
| --- | ---: | --- | --- |
| Studionet | 61999 | [`0xfB0dF18C4c55179Bb57Bbbe48AE2d61Dc282043E`](https://explorer-studio.genlayer.com/address/0xfB0dF18C4c55179Bb57Bbbe48AE2d61Dc282043E) | `c4270798e5b002f7e505e7fbf5e2793f6ff7297c4f89ccc6ee131db4a3ab3b2a` |
| Bradbury | 4221 | [`0x503Bdaed62C1419516052Eb5cE55d4cE6210f67D`](https://explorer-bradbury.genlayer.com/address/0x503Bdaed62C1419516052Eb5cE55d4cE6210f67D) | `c4270798e5b002f7e505e7fbf5e2793f6ff7297c4f89ccc6ee131db4a3ab3b2a` |

Live verification at `2026-09-05T11:52:27Z` established on both networks:

- frontend address equals manifest address;
- `gen_getContractCode` hash equals manifest hash;
- `get_factory_address()` equals the configured address;
- release window is 86,400 seconds;
- `task_count` equals registry length (both were zero at verification time);
- exact factory + embedded child source is archived in `deployments/sources/`;
- current source and deployment archive both pass 23/23 portable tests.

Full output: [`deployments/active-verification.md`](../deployments/active-verification.md).
Machine-readable record: [`deployments/deployments.json`](../deployments/deployments.json).

## Evidence still required

The two factory deployment transaction hashes were not supplied alongside the
addresses and cannot be derived safely from the address alone. Therefore
`deploymentTx` remains `null` in the manifest. Add the finalized hashes before
submitting a claim of complete deployment provenance.

Both new registries were empty during verification. Per-task matching
factory/child/escrow reads and recipient balance deltas therefore require a live
lifecycle run. The supplied script produces them without manual transcription:

```bash
export CREATOR_PRIVATE_KEY=0x...  # funded; never commit
export WORKER_PRIVATE_KEY=0x...   # funded; never commit
node scripts/studionet-e2e.mjs studionet | tee deployments/studionet-e2e.log
node scripts/verify-deployment.mjs studionet | tee deployments/studionet-verification.log
```

The cancellation and expiry paths settle during one session. A verified/rejected
submission waits through its intentional 24-hour challenge window before final
payout/refund.

## Reproducible next release

### 1. Local gate

```bash
python3 contracts/generate_factory.py
python3 -m py_compile contracts/task_factory.py contracts/task_verifier.py
python3 contracts/tests/test_proofgrid.py
PROOFGRID_CONTRACT_DIR=deployments/sources/c4270798e5b002f7e505e7fbf5e2793f6ff7297c4f89ccc6ee131db4a3ab3b2a \
  python3 contracts/tests/test_proofgrid.py
node scripts/update-source-hashes.mjs
```

### 2. Prepare the network-specific source

```bash
python3 scripts/prepare-contract-artifact.py --network studionet
python3 scripts/prepare-contract-artifact.py --network bradbury
```

Use `--runner <PINNED_PY_GENLAYER_HASH>` only when GenLayer requires a different runner; that intentionally changes the source hash and requires a fresh verified deployment.

Deploy only `dist/contracts/<network>/task_factory.py`, with no constructor
arguments, and wait for `FINALIZED`.

### 3. Verify and record

```bash
node scripts/record-deployment.mjs \
  --network studionet \
  --address 0x<FACTORY> \
  --tx 0x<FINALIZED_DEPLOYMENT_TX>
```

The recorder refuses a source mismatch or an incomplete repaired-lifecycle
schema. It then updates the committed manifest and local frontend config.
