# Steward requirements matrix

| Requirement | Implementation | Automated evidence | Live evidence | Status |
| --- | --- | --- | --- | --- |
| Active address + source hash | Deployment manifest, source archive, `getContractCode` hashing | `npm run verify:deployments` | Both factory + embedded-child hashes MATCH | Complete |
| Frontend/factory alignment | Manifest-backed `src/lib/networks.ts`; factory self-report | verifier compares address and `get_factory_address` | MATCH on Studionet and Bradbury | Complete |
| Factory/child/escrow read alignment | verifier compares child binding, reward/escrow and settlement | portable cross-read test | New registries are empty, so no per-task live read yet | Needs one live task |
| Cancellation settlement | terminal open-only cancel; immediate creator refund | portable tests | lifecycle script prepared | Code/test complete; live hash pending |
| Expiry settlement | permissionless expire after deadline for open/claimed | portable tests | lifecycle script prepared | Code/test complete; live hash pending |
| Orphan deployment custody | pending custody + activation; seven-day creator reclaim | deploy-failure + orphan tests | live source/hash verified | Complete except live reclaim example |
| Canonical chain time | `_chain_now()` in child/factory guards | deadline, expiry, dispute, release tests | source verified on both networks | Complete |
| Canonical HTTPS GitHub hostname | parsed scheme/host/port/path validation | lookalike suite | source verified on both networks | Complete |
| Self-claim prevention | creator rejected, second claim rejected | portable tests | source verified | Complete |
| Failed evidence fetch | transient/empty fetch reverts and custody remains | portable tests | source verified | Complete |
| Malformed AI output | strict output schema; malformed never passes | portable tests | source verified | Complete |
| Disputes | party-only, within window, freezes, fresh re-review | portable tests | source verified | Complete |
| Full lifecycle | create → activate → claim → evidence → verdict → challenge → payout/refund | 23/23 portable tests with balance accounting | needs funded Studionet keys | Automated complete; live evidence pending |
| Finalized hashes, before/after escrow and recipient balances | `scripts/studionet-e2e.mjs` | script syntax/build gate | not run: no funded private key in sandbox | Pending external funded run |

## Required command for the remaining live evidence

```bash
export CREATOR_PRIVATE_KEY=0x...  # funded Studionet wallet
export WORKER_PRIVATE_KEY=0x...   # funded Studionet wallet
node scripts/studionet-e2e.mjs studionet | tee deployments/studionet-e2e.log
node scripts/verify-deployment.mjs studionet | tee deployments/studionet-verification.log
```

Do not claim the final live-evidence rows as complete until the generated log contains finalized transaction hashes, before/after escrow reads and recipient balance deltas. The repository intentionally reports this gap rather than inventing evidence.
