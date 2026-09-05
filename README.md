# ProofGrid

ProofGrid is a task marketplace on GenLayer. A creator posts and funds a task with GEN; a worker claims it and submits evidence; GenLayer validators evaluate the work against its rubric; the factory settles the locked reward to the worker or refunds the creator based on the child contract's final state.

Every participant signs actions with MetaMask. The application does not use local accounts, does not store tasks in a private database, and never handles user private keys.

---

## Active deployments

[`deployments/deployments.json`](deployments/deployments.json) is the single deployment source used by the frontend. [`deployments/ACTIVE.md`](deployments/ACTIVE.md) is the generated human-readable table and is refreshed automatically.

| Network | Chain ID | Active `TaskFactory` | Deployed source SHA-256 |
| --- | ---: | --- | --- |
| GenLayer Studio / Studionet | 61999 | [`0xfB0dF18C4c55179Bb57Bbbe48AE2d61Dc282043E`](https://explorer-studio.genlayer.com/address/0xfB0dF18C4c55179Bb57Bbbe48AE2d61Dc282043E) | `c4270798e5b002f7e505e7fbf5e2793f6ff7297c4f89ccc6ee131db4a3ab3b2a` |
| Asimov / Bradbury Testnet | 4221 | [`0x503Bdaed62C1419516052Eb5cE55d4cE6210f67D`](https://explorer-bradbury.genlayer.com/address/0x503Bdaed62C1419516052Eb5cE55d4cE6210f67D) | `c4270798e5b002f7e505e7fbf5e2793f6ff7297c4f89ccc6ee131db4a3ab3b2a` |

Embedded `TaskVerifier` source SHA-256 on both networks:

```text
9806f9c34da2612f73fca430c22f414bb9e1ea71b897ff001e716e600e1034ad
```

The source in `contracts/` is byte-identical to what is deployed at both active addresses:

```text
contracts/task_factory.py
  c4270798e5b002f7e505e7fbf5e2793f6ff7297c4f89ccc6ee131db4a3ab3b2a

contracts/task_verifier.py
  9806f9c34da2612f73fca430c22f414bb9e1ea71b897ff001e716e600e1034ad
```

Verify the deployed source, embedded child, frontend route and factory identity:

```bash
npm run verify:deployments
```

Current live verification output confirms on both networks:

```text
source alignment: MATCH
child alignment: MATCH
factory self-report: MATCH
release window: 86400 seconds
registry count: MATCH
```

Detailed output is stored in [`deployments/active-verification.md`](deployments/active-verification.md).

> The factory addresses were supplied without their deployment transaction hashes. `deploymentTx` therefore remains `null` in the manifest. This repository does not fabricate hashes or infer them without verifiable data.

---

## Architecture

```text
MetaMask user
    │
    ▼
Next.js frontend
    │
    ├── selected network: Studionet or Bradbury
    ▼
TaskFactory on that network
    │
    ├── holds GEN escrow
    ├── schedules the child deployment
    ├── activates only a readable, matching child
    ├── keeps the public task registry
    └── pays out or refunds the escrow
         │
         ▼
TaskVerifier child (one per task)
    │
    ├── stores task data and worker
    ├── enforces creator/worker permissions
    ├── stores evidence privately
    ├── fetches and evaluates submitted work
    ├── supports disputes
    ├── handles cancellation, expiry and settlement state
    └── exposes canonical chain time
```

### Frontend responsibilities

Main modules:

- `src/lib/networks.ts` — network selection and the active factory. Verified manifest data takes precedence over stale public environment variables.
- `src/lib/contract.ts` — `genlayer-js` clients, writes, receipt validation, embedded return decoding, child resolution and activation.
- `src/lib/wallet.ts` — MetaMask connection through EIP-1193, including `wallet_switchEthereumChain` and `wallet_addEthereumChain`.
- `src/contexts/WalletContext.tsx` — shared wallet and network state.
- `src/hooks/useTasks.ts` — reads the registry, child states and escrow statuses on the selected network.
- `src/app/page.tsx` — task board.
- `src/app/(app)/create/page.tsx` — task creation and reward deposit.
- `src/app/(app)/task/[address]/page.tsx` — claim, submission, verdict, dispute, expiry and settlement.
- `src/app/(app)/dashboard/page.tsx` — creator and worker tasks for the connected account.

Reads can be public. Every transaction that changes contract state requires MetaMask.

---

## Contract roles

### `TaskFactory`

One factory per network. It is the only application entry point users configure.

Core responsibilities:

1. Receive the reward through payable `create_task`.
2. Require a positive reward and an attached value equal to `reward × 10^18` atto-GEN.
3. Require a future deadline using canonical chain time.
4. Record the creator, set creation time and retain command of the escrow while deployment is pending.
5. Schedule a deterministic internal child deployment.
6. Aggregate tasks **only** after the child reads successfully and matches its custody record.
7. Verify factory binding before settlement.
8. Cross-check child settlement before sending native GEN out of factory custody.
9. Record `released` and `paid_to`, and prevent double release.
10. Refund pending custody when a child never becomes readable after the safety period.

Important methods:

```text
create_task
activate_task
release_funds
reclaim_unresolved
get_all_tasks
get_task_count
get_escrow_status
get_settlement_status
get_release_window
get_factory_address
```

### `TaskVerifier`

One child per task. It defines the task lifecycle; it does not own its escrow.

It stores:

- creator and factory binding;
- title, description, category and priority;
- rubric and evidence format;
- reward and deadline;
- assigned worker;
- submission URL/note;
- verdict, confidence and reasoning;
- dispute information;
- timestamps, cancellation and expiry state.

Lifecycle:

```text
open
  └── worker claims → claimed
                      └── worker submits → submitted
                                             └── validator verdict → verified / rejected
                                             └── dispute → disputed → re-review
```

Terminal paths:

```text
open → cancelled
open / claimed after deadline → expired
```

Important methods:

```text
claim_task
submit_work
request_verification
dispute
cancel_task
expire_task
get_task_state
get_settlement
```

---

## Complete participant workflow

### 1. Connect a wallet and choose a network

1. The user connects MetaMask.
2. The selected account becomes the application's identity.
3. When the user changes network, MetaMask is asked to switch to the matching GenLayer chain.
4. All future reads and writes target the factory configured for that network.

No account credentials are ever stored by the app.

### 2. Create a task and deposit the reward

The creator provides the task description, rubric, reward and deadline. The frontend sends:

```text
create_task(...)
value = reward × 10^18 atto-GEN
```

The factory:

```text
validates positive reward
→ validates exact attached value
→ validates a future chain-time deadline
→ records the creator and pending custody
→ schedules a deterministic child deployment
→ returns the pending child address
```

A deterministic address alone is not accepted as proof that the child already exists. The frontend then:

```text
resolves the child from the receipt or triggered internal transaction
→ polls get_task_state until the child is readable
→ verifies child.factory, child.creator and child.reward
→ calls activate_task
→ the task enters the public board registry
```

MetaMask may display two confirmations: deposit/create and activation.

If the user leaves the page before activation, the task remains discoverable as pending and can be activated later. If the child never materialises, the creator can reclaim the escrow after the seven-day safety period, and reclaim refuses when the child is readable.

### 3. Claim a task

A worker signs `claim_task` with MetaMask.

The child rejects the call if:

- the task is not open;
- the caller is the creator;
- the deadline has passed;
- another worker already claimed it.

Creator self-claim is impossible.

### 4. Submit evidence and trigger the validator verdict

Only the assigned worker may submit before the deadline.

`submit_work`:

1. validates caller and state;
2. validates URL format;
3. records evidence;
4. fetches current content from the submitted URL;
5. runs an AI verification prompt on GenLayer;
6. resolves the verdict through comparative consensus;
7. stores the verdict and timestamp in-chain.

A failed or empty evidence fetch reverts the transaction. The task remains claimable and the reward remains in factory custody.

Malformed AI output cannot pass. A valid verdict requires:

- a real boolean `verified` value;
- an integer `confidence` value;
- a non-empty `reasoning` string.

### 5. Evidence privacy

`get_task_state()` returns the full evidence URL and note only when the caller is:

- the creator; or
- the assigned worker.

Other viewers receive a private sentinel and can only see the public task, status, reward and settlement indicators.

### 6. Challenge window and dispute

A verdict does not trigger payment immediately:

```text
verified / rejected
→ 24-hour challenge window
→ payout or refund only if there is no successful dispute
```

Before the window closes, the creator or worker may dispute with a meaningful reason. A dispute:

- stores the reason;
- resets the verdict timestamp;
- freezes settlement;
- allows a fresh `request_verification`;
- supplies the dispute reason to the re-review;
- begins a new challenge window after the new verdict.

A dispute requested after the window closes is rejected.

### 7. Settlement

The child's `get_settlement()` view is the canonical settlement decision. The factory reads it before sending any GEN.

| State | Recipient | When it becomes payable |
| --- | --- | --- |
| `verified` | worker | 24 hours after the verdict |
| `rejected` | creator | 24 hours after the verdict |
| `cancelled` | creator | immediately |
| `expired` | creator | immediately |
| pending child unreachable | creator | after the seven-day safety period |

Anyone may call `release_funds`, but nobody can choose the payout address. The contract determines the recipient, records the recipient, transfers the reward out of factory custody and prevents a second release.

---

## Escrow cannot remain stranded

### Creator cancellation

The creator may cancel only before a worker claims:

```text
open → cancelled → creator refund available immediately
```

Cancellation is terminal and cannot be reused to remove a worker.

### Deadline expiry

After the deadline passes, an open or claimed task can be marked expired by anyone:

```text
open / expired claim → expired → creator refund available immediately
```

This prevents an abandoned claim from holding the reward forever.

### Internal deployment failure

A child does not enter the board until activation proves it exists and matches custody:

```text
pending custody
→ child never materialises
→ creator reclaims after the safety period
```

The refund path rejects any attempt to reclaim an address that is readable, so it is not a shortcut around a live task.

---

## Canonical chain-time source

Both contracts route every time guard through `_chain_now()`. GenVM injects a transaction-wide datetime into the execution environment, so validator replays observe the same canonical timestamp.

The same source controls:

- task-creation deadline validation;
- claim deadline validation;
- submission deadline validation;
- expiry;
- dispute cutoff;
- 24-hour challenge window;
- escrow release timing;
- seven-day unresolved-child reclaim timing.

The browser clock is display-only. It cannot authorize an expired task, an early release or a late dispute.

---

## Canonical HTTPS GitHub hostname validation

A task that expects a GitHub Repository accepts only URLs such as:

```text
https://github.com/<owner>/<repository>
https://www.github.com/<owner>/<repository>
```

The parser requires:

- HTTPS;
- exact hostname `github.com` or `www.github.com`;
- no user credentials in the authority;
- no custom port;
- at least `/owner/repository` in the path.

It rejects values such as:

```text
https://github.com.evil.tld/owner/repo
https://evil-github.com/owner/repo
https://notgithub.com/owner/repo
https://raw.githubusercontent.com/owner/repo
http://github.com/owner/repo
https://user@github.com/owner/repo
https://github.com:8443/owner/repo
https://github.com/owner
https://evil.tld/?next=https://github.com/owner/repo
```

There is no substring-based host check.

---

## Portable contract tests

The portable suite uses only the Python standard library. No chain, node, service or pytest installation is required:

```bash
npm run test:contracts
npm run test:contracts:active
```

Current results:

```text
23/23 passed
```

The suite covers:

- incorrect factory configuration and rebinding;
- child deployment failure and attached-value rollback;
- pending activation and child activation checks;
- pending-task custody;
- unreachable child and safety reclaim;
- open cancellation;
- abandoned claimed-task expiry;
- creator self-claim;
- claim stealing;
- unauthorized submission;
- canonical and lookalike GitHub hosts;
- failed or empty evidence fetch;
- malformed AI output;
- dispute and late dispute;
- evidence privacy;
- reward and value mismatch;
- matching child, factory and escrow settlement reads;
- the complete create → activate → claim → evidence → verdict → challenge window → payout/refund flow;
- recipient balance changes and double-release protection inside the test chain runtime.

Files:

- `contracts/tests/test_proofgrid.py`
- `contracts/tests/genvm_stub.py`

---

## Deployment and consistency verification

Run:

```bash
npm run verify:deployments
```

The verifier reads both live networks and confirms:

```text
frontend factory
= manifest factory
= factory self-report
= deployed factory source hash target
```

For every activated task it additionally verifies:

```text
child.factory == selected factory
child.reward == factory locked escrow
child settlement recipient/reason == factory settlement view
registry length == task_count
```

Evidence files:

- `deployments/deployments.json`
- `deployments/ACTIVE.md`
- `deployments/active-verification.md`
- `deployments/sources/<factory-source-sha256>/`

---

## Studionet lifecycle evidence

The evidence script uses the active factory and does not deploy another factory:

```bash
export CREATOR_PRIVATE_KEY=0x...
export WORKER_PRIVATE_KEY=0x...

node scripts/studionet-e2e.mjs studionet \
  | tee deployments/studionet-e2e.log

node scripts/verify-deployment.mjs studionet \
  | tee deployments/studionet-verification.log
```

It prints:

- finalized transaction hashes;
- explorer links for every action;
- escrow before/after cancellation;
- escrow before/after expiry;
- settlement recipient;
- before/after recipient balances;
- create, activate, claim, submit and verdict hashes;
- challenge-window state.

### Evidence state at this commit

Verified through live reads:

- active factory addresses;
- deployed factory source hashes;
- embedded child source hashes;
- frontend route and factory self-report;
- release window;
- registry count;
- unknown escrow and settlement reads.

Not available in this repository:

- the two factories' deployment transaction hashes, because they were not supplied with the addresses;
- per-task live escrow/balance reads on the newly configured factories, because both registries were empty at verification time;
- recipient balance deltas from a real lifecycle, because no funded Studionet private key exists in this sandbox.

No transaction hash, amount or balance evidence has been fabricated. Funded keys and the scripts above are the legitimate path to complete this evidence.

Full requirement-to-evidence mapping: [`docs/requirements-matrix.md`](docs/requirements-matrix.md).

---

## Local development

Prerequisites:

- Node.js 20+
- npm
- Python 3.11+
- MetaMask

```bash
npm install
cp .env.example .env.local
npm run dev
```

The frontend first reads verified active addresses from the committed manifest. Public environment variables are bootstrap fallbacks only when the manifest has no address.

```bash
NEXT_PUBLIC_STUDIONET_FACTORY=0xfB0dF18C4c55179Bb57Bbbe48AE2d61Dc282043E
NEXT_PUBLIC_BRADBURY_FACTORY=0x503Bdaed62C1419516052Eb5cE55d4cE6210f67D
NEXT_PUBLIC_DEFAULT_NETWORK=studionet
```

Never expose private keys through `NEXT_PUBLIC_*` values or the frontend deployment environment.

---

## Release gate

Run before pushing or deploying:

```bash
npm run release:check
```

The gate performs:

1. embedded child regeneration;
2. Python syntax compilation;
3. 23 portable contract tests;
4. deployed-source archive tests;
5. source-hash refresh;
6. ESLint;
7. Next.js type generation;
8. TypeScript and production build;
9. live verification on Studionet and Bradbury.

---

## Deploying a new contract and updating the project

Do not edit contract addresses manually in source files. Use this workflow.

### 1. Change only the contracts

Edit:

```text
contracts/task_verifier.py
contracts/task_factory.py
```

After modifying the child:

```bash
npm run hashes
```

This embeds the child into the factory, updates source hashes in the manifest and regenerates the active deployment table.

### 2. Run the release gate

```bash
npm run release:check
```

If the source changed but a new factory is not yet deployed, live verification intentionally fails with a source mismatch. This is the expected fail-safe.

### 3. Prepare the artifact

```bash
npm run deployment:prepare:studionet
npm run deployment:prepare:bradbury
```

Artifacts:

```text
dist/contracts/studionet/task_factory.py
dist/contracts/bradbury/task_factory.py
```

Deploy only the factory. Do not deploy the child directly and do not pass constructor arguments.

### 4. Record the new deployment automatically

After the deployment transaction reaches `FINALIZED`:

```bash
npm run deployment:record -- \
  --network studionet \
  --address 0x<NEW_FACTORY> \
  --tx 0x<FINALIZED_DEPLOYMENT_TX>
```

Or for Bradbury:

```bash
npm run deployment:record -- \
  --network bradbury \
  --address 0x<NEW_FACTORY> \
  --tx 0x<FINALIZED_DEPLOYMENT_TX>
```

This one command:

1. verifies the transaction is finalized and successfully executed;
2. compares the deployed factory to `contracts/task_factory.py` byte-for-byte;
3. compares the embedded child to `contracts/task_verifier.py` byte-for-byte;
4. verifies `get_factory_address`, custody and settlement views;
5. archives the exact deployed source;
6. updates `deployments/deployments.json`;
7. refreshes `.env.local` and `.env.example`;
8. regenerates `deployments/ACTIVE.md`.

The verified manifest takes precedence over stale environment variables, so the frontend cannot be silently routed back to an old factory. No `networks.ts` or README table edit is required.

### 5. Verify the deployment and rebuild

```bash
npm run verify:deployments
npm run release:check
```

Commit the updated manifest, active table and source archive, then redeploy the frontend.

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the frontend locally |
| `npm run build` | Build the production application |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript validation |
| `npm run test:contracts` | Run portable contract tests |
| `npm run test:contracts:active` | Test the byte-locked deployed source archive |
| `npm run hashes` | Embed the child and update canonical hashes |
| `npm run verify:deployments` | Verify both active factories on-chain |
| `npm run release:check` | Run the complete release gate |
| `npm run deployment:prepare:studionet` | Prepare the Studionet factory artifact |
| `npm run deployment:prepare:bradbury` | Prepare the Bradbury factory artifact |
| `npm run deployment:record -- ...` | Verify and record a new deployment |
| `npm run deployment:show` | Regenerate the active deployment table |

---

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — trust boundaries and complete workflow.
- [`docs/requirements-matrix.md`](docs/requirements-matrix.md) — requirement-to-evidence mapping.
- [`docs/deployment-evidence.md`](docs/deployment-evidence.md) — deployment evidence procedure.
- [`docs/steward-response.md`](docs/steward-response.md) — technical response to review requirements.
- [`deployments/ACTIVE.md`](deployments/ACTIVE.md) — generated active deployment table.

---

## Push to GitHub

Run the gate before committing:

```bash
npm run release:check
git status --short
```

Ensure `.env.local`, private keys, `.next`, `dist` and Python caches are absent from the commit.

Create an empty GitHub repository, then:

```bash
git init
git branch -M main
git add -A
git commit -m "feat: complete ProofGrid contracts and deployment automation"
git remote add origin https://github.com/<YOUR_USERNAME>/proofgrid.git
git push -u origin main
```

If the remote already exists:

```bash
git remote set-url origin https://github.com/<YOUR_USERNAME>/proofgrid.git
git push -u origin main
```

Or use GitHub CLI:

```bash
gh auth login
gh repo create proofgrid --public --source=. --remote=origin --push
```

---

## License

MIT
