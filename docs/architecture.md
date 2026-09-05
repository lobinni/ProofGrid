# ProofGrid architecture and workflow

## Trust boundaries

- **MetaMask** owns the user key and signs every state-changing transaction.
- **TaskFactory** is the only configured application entry point on each network. It holds native GEN, deploys children, maintains the activated-task registry, and executes settlement transfers.
- **TaskVerifier** is one child per task. It owns the lifecycle, evidence privacy, canonical deadlines, validator verdict, dispute state, cancellation and expiry.
- **GenLayer validators** fetch evidence and agree on the AI decision. No frontend or database can set a verdict.
- **Frontend** is a read/write client only. It routes to the selected live network and never persists authoritative task or escrow state.

## Network routing

`src/lib/networks.ts` reads the committed verified manifest. Static public environment values are bootstrap fallbacks only when the manifest lacks an address, so stale hosting configuration cannot override a recorded deployment. Each network entry contains exactly one active factory:

- Studionet 61999 → `0xfB0dF18C4c55179Bb57Bbbe48AE2d61Dc282043E`
- Bradbury 4221 → `0x503Bdaed62C1419516052Eb5cE55d4cE6210f67D`

A network switch changes the GenLayer chain object, factory address, read client, MetaMask chain and every subsequent transaction. There is no local task database or simulated fallback.

## Create and custody

1. Creator enters task data, reward and a future deadline.
2. Frontend calls payable `create_task` on the factory selected in the network menu. Attached native value is exactly `reward × 10^18` atto-GEN.
3. Factory checks positive reward, exact value and canonical future deadline.
4. Factory schedules a deterministic child deployment and records pending custody, creator and creation time. Pending tasks are not part of `get_all_tasks`.
5. Frontend decodes the child address from the leader result or the triggered internal transaction, then polls `get_task_state` until the child exists.
6. Frontend calls `activate_task`. Factory reads the child and checks child.factory, child.creator and child.reward against the custody record.
7. Only then does the address enter the public task registry.
8. If a child never materialises, the creator can call `reclaim_unresolved` after seven days. It refuses when the child is reachable.

This two-step flow is why MetaMask may ask for a second confirmation after creation.

## Claim and work submission

1. Any non-creator may call `claim_task` while status is open and chain time is not past the deadline.
2. Only the assigned worker may call `submit_work`.
3. URL validation is deterministic. A GitHub task accepts only HTTPS, exact `github.com`/`www.github.com`, no authority credentials, no custom port, and an owner/repository path.
4. Submission stores the evidence and immediately starts validator review in the same transaction.
5. Each validator fetches the current URL, evaluates it against the rubric and participates in comparative consensus.
6. Valid output is a strict boolean verdict, integer confidence and non-empty reasoning. Malformed output never passes.
7. Final state becomes verified or rejected with canonical `verified_at`.

Evidence URL/note are returned only to creator and worker. Other viewers receive the private sentinel.

## Dispute and re-review

- Creator or worker may dispute a verified/rejected verdict only before its 24-hour challenge window closes.
- A dispute stores the reason, resets `verified_at`, freezes settlement and moves the task to disputed.
- `request_verification` performs a fresh fetch and includes the dispute reason in the validator prompt.
- A new verified/rejected result starts a new challenge window.

## Settlement paths

`TaskVerifier.get_settlement` is the canonical settlement decision; the factory reads it before any transfer.

| State | Recipient | Ready |
| --- | --- | --- |
| verified | worker | verdict time + 24 hours |
| rejected | creator | verdict time + 24 hours |
| cancelled | creator | immediately |
| expired | creator | immediately after expiry transition |
| pending child unreachable | creator | seven-day safety reclaim |

- `cancel_task` is creator-only, open-only and terminal. It cannot remove a claimed worker.
- `expire_task` is permissionless after deadline for open/claimed tasks, so an abandoned worker cannot strand escrow.
- `release_funds` is permissionless but recipient is fixed by child settlement state.
- Factory checks child binding again, marks escrow released before emitting the transfer, records paid_to, and prevents double release.

## Canonical time

Both contracts route time reads through `_chain_now()`, backed by GenVM's transaction-wide injected datetime. The same value is observed by validator replays. Deadline, dispute, expiry, release and orphan-grace guards never trust the browser clock. The frontend uses child-provided chain time for display only; contract guards remain authoritative.

## Read consistency

For every activated task the deployment verifier compares:

- frontend factory address vs factory self-report;
- child.factory vs selected factory;
- child reward vs factory locked amount;
- child settlement recipient/reason vs factory settlement view;
- task_count vs get_all_tasks length;
- deployed factory and embedded-child source hashes vs manifest.

Run: `npm run verify:deployments`.
