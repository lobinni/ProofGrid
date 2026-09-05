# ProofGrid

ProofGrid là một task marketplace chạy trực tiếp trên GenLayer. Creator đăng và tài trợ task bằng GEN; worker nhận task, nộp bằng chứng; GenLayer validators đánh giá kết quả theo rubric; `TaskFactory` giữ escrow và chỉ thanh toán hoặc hoàn tiền theo trạng thái do `TaskVerifier` quyết định.

Toàn bộ user tham gia bằng **MetaMask**. Ứng dụng không có tài khoản nội bộ, không lưu task trong database và không giữ private key của user.

---

## Active deployments

[`deployments/deployments.json`](deployments/deployments.json) là nguồn cấu hình deployment duy nhất mà frontend sử dụng. Bảng dễ đọc được sinh tự động tại [`deployments/ACTIVE.md`](deployments/ACTIVE.md).

| Network | Chain ID | Active `TaskFactory` | Source SHA-256 |
| --- | ---: | --- | --- |
| GenLayer Studio / Studionet | 61999 | [`0xfB0dF18C4c55179Bb57Bbbe48AE2d61Dc282043E`](https://explorer-studio.genlayer.com/address/0xfB0dF18C4c55179Bb57Bbbe48AE2d61Dc282043E) | `c4270798e5b002f7e505e7fbf5e2793f6ff7297c4f89ccc6ee131db4a3ab3b2a` |
| Asimov / Bradbury Testnet | 4221 | [`0x503Bdaed62C1419516052Eb5cE55d4cE6210f67D`](https://explorer-bradbury.genlayer.com/address/0x503Bdaed62C1419516052Eb5cE55d4cE6210f67D) | `c4270798e5b002f7e505e7fbf5e2793f6ff7297c4f89ccc6ee131db4a3ab3b2a` |

Embedded `TaskVerifier` trên cả hai factory có SHA-256:

```text
9806f9c34da2612f73fca430c22f414bb9e1ea71b897ff001e716e600e1034ad
```

Các file trong `contracts/` hiện byte-identical với source đang chạy trên hai mạng:

```text
contracts/task_factory.py
  c4270798e5b002f7e505e7fbf5e2793f6ff7297c4f89ccc6ee131db4a3ab3b2a

contracts/task_verifier.py
  9806f9c34da2612f73fca430c22f414bb9e1ea71b897ff001e716e600e1034ad
```

Xác minh trực tiếp:

```bash
npm run verify:deployments
```

Script kiểm tra:

- factory frontend đang sử dụng;
- source thực đọc từ GenLayer RPC;
- source hash trong deployment manifest;
- embedded child source;
- `get_factory_address()` tự xác nhận đúng địa chỉ;
- release window;
- `task_count` khớp `get_all_tasks()`;
- với từng task: child factory binding, child state, reward, escrow và settlement reads.

Kết quả live hiện tại trên cả hai mạng:

```text
source alignment: MATCH
child alignment: MATCH
factory self-report: MATCH
release window: 86400 seconds
registry count: MATCH
```

Chi tiết: [`deployments/active-verification.md`](deployments/active-verification.md).

> Hai địa chỉ được cung cấp không đi kèm deployment transaction hash. Trường `deploymentTx` vì vậy vẫn là `null` trong manifest. Dự án không tạo hoặc suy đoán transaction hash giả.

---

## Kiến trúc

```text
MetaMask user
    │
    ▼
Next.js frontend
    │
    ├── selected network: Studionet hoặc Bradbury
    │
    ▼
TaskFactory của network
    │
    ├── giữ GEN escrow
    ├── tạo child contract
    ├── xác minh child trước khi đưa lên Board
    └── thực hiện payout/refund
         │
         ▼
TaskVerifier riêng của mỗi task
    │
    ├── lưu task state
    ├── claim / submit / dispute
    ├── bảo vệ evidence
    ├── validator verdict
    ├── cancel / expire
    └── quyết định settlement
```

### Frontend

Các phần chính:

- `src/lib/networks.ts` — đọc active factory từ deployment manifest; đổi network sẽ đổi toàn bộ read/write target.
- `src/lib/contract.ts` — client `genlayer-js`, read/write helpers, receipt validation, child resolution và activation.
- `src/lib/wallet.ts` — kết nối MetaMask qua EIP-1193, switch/add chain.
- `src/contexts/WalletContext.tsx` — trạng thái wallet và network dùng chung.
- `src/hooks/useTasks.ts` — đọc registry, child state và escrow từ mạng đang chọn.
- `src/app/page.tsx` — Board.
- `src/app/(app)/create/page.tsx` — tạo task và deposit reward.
- `src/app/(app)/task/[address]/page.tsx` — claim, submit, verdict, dispute và settlement.
- `src/app/(app)/dashboard/page.tsx` — task creator/worker theo MetaMask đang kết nối.

Không có task database hoặc local task fallback. Reads đi tới GenLayer RPC; writes được MetaMask ký và gửi tới contract của network đang chọn.

### `TaskFactory`

`TaskFactory` được deploy một lần trên mỗi network và có các trách nhiệm:

1. Nhận reward trong payable `create_task`.
2. Kiểm tra reward dương và `msg.value == reward × 10^18` atto-GEN.
3. Kiểm tra deadline bằng chain time.
4. Lưu pending custody, creator và thời điểm tạo.
5. Schedule internal child deployment.
6. Chỉ đưa child vào public registry sau `activate_task`.
7. Đọc settlement trực tiếp từ child trước payout/refund.
8. Ghi `released` và `paid_to`, ngăn double-release.
9. Cho creator reclaim pending escrow nếu child không materialize.

Các public methods chính:

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

Mỗi task có một `TaskVerifier` riêng. Contract này quản lý:

- creator và factory binding;
- mô tả, rubric, reward, deadline;
- assigned worker;
- evidence URL/note;
- validator verdict và reasoning;
- dispute state;
- cancellation, expiry và canonical settlement.

Các public methods chính:

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

## Workflow đầy đủ

### 1. Connect MetaMask và chọn network

1. User nhấn Connect.
2. MetaMask trả về account được user cho phép.
3. Khi đổi Studionet/Bradbury, ứng dụng gọi `wallet_switchEthereumChain`; nếu cần sẽ gọi `wallet_addEthereumChain`.
4. Mọi read/write tiếp theo sử dụng factory của network đó.

Reads có thể công khai; tất cả thay đổi state đều cần MetaMask ký.

### 2. Create task và deposit reward

Creator nhập nội dung task, rubric, reward và deadline. Frontend gửi:

```text
create_task(...)
value = reward × 10^18 atto-GEN
```

Factory thực hiện:

```text
validate reward + deadline
    → record pending custody
    → schedule deterministic child deployment
    → return pending child address
```

Child deployment trên GenLayer là asynchronous. Một deterministic address được trả về không đồng nghĩa child đã tồn tại. Vì vậy frontend tiếp tục:

```text
resolve child from receipt / triggered internal transaction
    → poll get_task_state until child is readable
    → verify child.factory, child.creator, child.reward
    → call activate_task
    → task appears on Board
```

Creator có thể phải xác nhận hai giao dịch MetaMask:

1. create + deposit;
2. activate task sau khi child materialize.

Nếu user rời trang trước activation, trang pending vẫn cho phép Retry activation. Nếu child không tồn tại, creator có thể reclaim escrow sau safety period.

### 3. Claim task

Worker gọi `claim_task` qua MetaMask. Contract từ chối khi:

- task không còn open;
- caller là creator;
- deadline đã qua;
- task đã được worker khác nhận.

### 4. Submit evidence và validator verdict

Chỉ assigned worker được submit trước deadline. `submit_work`:

1. kiểm tra caller và task state;
2. kiểm tra evidence URL;
3. lưu evidence;
4. fetch nội dung từ URL;
5. yêu cầu GenLayer validators đánh giá theo rubric;
6. đạt comparative consensus;
7. chuyển trạng thái sang `verified` hoặc `rejected`.

Failed/empty evidence fetch làm transaction revert và escrow vẫn nằm trong factory. AI output malformed không được coi là accepted.

### 5. Evidence privacy

`get_task_state()` chỉ trả evidence URL/note đầy đủ khi caller là:

- creator; hoặc
- assigned worker.

User khác chỉ nhận private sentinel, nhưng vẫn xem được title, rubric, status, reward và public settlement state.

### 6. Challenge và dispute

Sau verdict có challenge window 24 giờ:

```text
verified/rejected
    → 24h challenge window
    → release/refund nếu không dispute
```

Creator hoặc worker có thể dispute trước khi window đóng. Dispute:

- lưu lý do;
- reset `verified_at`;
- đóng băng settlement;
- cho phép `request_verification` fetch lại evidence và đưa dispute reason vào review;
- verdict mới bắt đầu challenge window mới.

### 7. Settlement

`TaskVerifier.get_settlement()` là nguồn quyết định canonical. `TaskFactory.release_funds()` đọc view này trước khi chuyển GEN.

| State | Recipient | Ready |
| --- | --- | --- |
| `verified` | worker | sau verdict 24 giờ |
| `rejected` | creator | sau verdict 24 giờ |
| `cancelled` | creator | ngay lập tức |
| `expired` | creator | ngay sau expiry transition |
| pending child unreachable | creator | sau safety period |

Bất kỳ user nào cũng có thể trigger `release_funds`, nhưng không thể thay đổi recipient. Factory xác định recipient từ child settlement, đánh dấu escrow released trước transfer và chặn double-release.

---

## Không để escrow bị stranded

### Cancellation

Creator chỉ được cancel khi task còn open và chưa có worker:

```text
open → cancelled → refund creator
```

Cancellation là terminal; không mở lại task và không giữ reward vô thời hạn.

### Expiry

Sau deadline, bất kỳ user nào cũng có thể gọi `expire_task` cho task open hoặc claimed:

```text
open/claimed → expired → refund creator
```

Điều này xử lý trường hợp worker claim rồi bỏ task.

### Child deployment failure

Pending child không được đưa lên Board trước activation. Nếu không materialize:

```text
pending custody
    → child remains unreachable
    → creator reclaim after safety period
```

`reclaim_unresolved` chỉ thành công khi caller là creator, grace period đã qua và child thực sự không đọc được.

---

## Canonical chain time

Cả factory và child đều dùng `_chain_now()` dựa trên transaction-wide datetime do GenVM inject. Đây là nguồn thời gian dùng cho:

- create deadline;
- claim deadline;
- submit deadline;
- expiry;
- dispute cutoff;
- challenge window;
- reward release;
- unresolved-child reclaim period.

Frontend có thể hiển thị countdown nhưng không có quyền quyết định action hợp lệ. Contract guard luôn là authority cuối cùng.

---

## Canonical HTTPS GitHub validation

Task có format `GitHub Repository` chỉ chấp nhận:

```text
https://github.com/<owner>/<repository>
https://www.github.com/<owner>/<repository>
```

Contract parse URL và kiểm tra:

- scheme phải là HTTPS;
- hostname phải chính xác `github.com` hoặc `www.github.com`;
- không userinfo;
- không custom port;
- path phải có owner/repository.

Các URL sau bị từ chối:

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

Không còn kiểm tra bằng substring.

---

## Portable contract tests

Test harness dùng Python standard library, không cần local chain hoặc pytest:

```bash
npm run test:contracts
npm run test:contracts:active
```

Kết quả hiện tại:

```text
23/23 passed
```

Coverage:

- wrong factory configuration/binding;
- child deployment failure;
- attached-value rollback và factory custody;
- pending activation và unresolved child recovery;
- expiry của open task;
- expiry của abandoned claimed task;
- terminal cancellation;
- creator self-claim;
- claim stealing;
- unauthorized submission;
- canonical và lookalike GitHub hosts;
- failed/empty evidence fetch;
- malformed AI output;
- disputes và late disputes;
- evidence privacy;
- reward/value mismatch;
- factory/child/escrow settlement read consistency;
- full create → activate → claim → evidence → verdict → challenge → payout/refund flow;
- recipient balance changes và double-release protection trong test runtime.

Test files:

- `contracts/tests/test_proofgrid.py`
- `contracts/tests/genvm_stub.py`

---

## Live deployment verification

```bash
npm run verify:deployments
```

Lệnh này đọc trực tiếp Studionet và Bradbury, so sánh:

```text
frontend factory
= manifest factory
= get_factory_address()
= deployed source hash target
```

Với mỗi activated task, script còn kiểm tra:

```text
child.factory == selected factory
child.reward == factory escrow amount
child settlement == factory settlement
registry length == task_count
```

Machine-readable evidence:

- `deployments/deployments.json`
- `deployments/ACTIVE.md`
- `deployments/active-verification.md`
- `deployments/sources/<factory-source-hash>/`

---

## Studionet lifecycle evidence

Script sau sử dụng **factory active hiện tại**, không deploy factory phụ:

```bash
export CREATOR_PRIVATE_KEY=0x...  # funded Studionet wallet
export WORKER_PRIVATE_KEY=0x...   # funded Studionet wallet

node scripts/studionet-e2e.mjs studionet \
  | tee deployments/studionet-e2e.log

node scripts/verify-deployment.mjs studionet \
  | tee deployments/studionet-verification.log
```

Script ghi:

- finalized transaction hash của từng action;
- explorer link;
- escrow trước/sau cancellation;
- escrow trước/sau expiry;
- settlement recipient;
- recipient balance trước/sau;
- create, activate, claim và submit hashes;
- validator verdict;
- challenge-window state.

### Trạng thái evidence hiện tại

Đã xác minh live trên hai mạng:

- active factory address;
- factory source hash;
- embedded child source hash;
- frontend/factory alignment;
- factory self-report;
- release window;
- registry và unknown escrow/settlement reads.

Chưa có trong repository:

- finalized deployment transaction hashes của hai factory vì chúng không được cung cấp cùng địa chỉ;
- per-task live reads trên hai factory mới vì registry đang rỗng tại thời điểm kiểm tra;
- before/after recipient balance của lifecycle live vì sandbox không có funded private key.

Dự án không bịa transaction hash hoặc balance evidence. Chạy script bằng funded keys và commit log để hoàn tất phần này.

Ma trận yêu cầu: [`docs/requirements-matrix.md`](docs/requirements-matrix.md).

---

## Cài đặt local

Yêu cầu:

- Node.js 20+
- npm
- Python 3.11+
- MetaMask

```bash
npm install
cp .env.example .env.local
npm run dev
```

Frontend đọc active factory từ committed manifest. `.env.local` chỉ là bootstrap/local override khi manifest chưa có address.

Các biến public:

```bash
NEXT_PUBLIC_STUDIONET_FACTORY=0xfB0dF18C4c55179Bb57Bbbe48AE2d61Dc282043E
NEXT_PUBLIC_BRADBURY_FACTORY=0x503Bdaed62C1419516052Eb5cE55d4cE6210f67D
NEXT_PUBLIC_DEFAULT_NETWORK=studionet
```

Không đưa private key vào biến `NEXT_PUBLIC_*` hoặc Vercel frontend environment.

---

## Release gate

Chạy trước khi push hoặc deploy:

```bash
npm run release:check
```

Bao gồm:

1. regenerate embedded child;
2. Python syntax check;
3. 23 portable contract tests;
4. byte-locked deployed-source tests;
5. source hash refresh;
6. ESLint;
7. Next.js type generation;
8. TypeScript và production build;
9. live verification trên Studionet và Bradbury.

---

## Deploy contract mới và cập nhật dự án

Không sửa địa chỉ thủ công trong nhiều file. Chỉ dùng workflow dưới đây.

### 1. Sửa contract

Chỉ sửa:

```text
contracts/task_verifier.py
contracts/task_factory.py
```

Nếu sửa child:

```bash
npm run hashes
```

Lệnh này nhúng child vào factory, cập nhật hash manifest và sinh lại tài liệu deployment.

### 2. Kiểm tra

```bash
npm run release:check
```

Lưu ý: live verification sẽ báo source mismatch sau khi source đã thay đổi nhưng chưa redeploy. Đây là fail-safe đúng thiết kế.

### 3. Chuẩn bị artifact

```bash
npm run deployment:prepare:studionet
npm run deployment:prepare:bradbury
```

Artifact:

```text
dist/contracts/studionet/task_factory.py
dist/contracts/bradbury/task_factory.py
```

Deploy **chỉ factory**, không deploy child trực tiếp và không truyền constructor arguments.

### 4. Ghi nhận deployment bằng một lệnh

Sau khi transaction đạt `FINALIZED`:

```bash
npm run deployment:record -- \
  --network studionet \
  --address 0x<NEW_FACTORY> \
  --tx 0x<FINALIZED_DEPLOYMENT_TX>
```

Hoặc:

```bash
npm run deployment:record -- \
  --network bradbury \
  --address 0x<NEW_FACTORY> \
  --tx 0x<FINALIZED_DEPLOYMENT_TX>
```

Lệnh tự động:

1. xác minh transaction finalized và execution thành công;
2. so source live với `contracts/task_factory.py`;
3. so embedded child với `contracts/task_verifier.py`;
4. kiểm tra `get_factory_address` và custody/settlement views;
5. archive exact deployed source;
6. cập nhật `deployments/deployments.json`;
7. cập nhật `.env.local` và `.env.example`;
8. sinh lại `deployments/ACTIVE.md`.

Frontend ưu tiên manifest đã xác minh, vì vậy stale Vercel env không thể ghi đè contract mới. Không cần sửa `src/lib/networks.ts` hoặc bảng README.

### 5. Xác minh lại

```bash
npm run verify:deployments
npm run release:check
```

Commit manifest, active table và source archive rồi redeploy frontend.

---

## Các scripts quan trọng

| Command | Chức năng |
| --- | --- |
| `npm run dev` | Chạy frontend local |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm run test:contracts` | Portable contract tests |
| `npm run test:contracts:active` | Test byte-locked source archive |
| `npm run hashes` | Embed child và cập nhật source hashes |
| `npm run verify:deployments` | Verify hai factory live |
| `npm run release:check` | Chạy toàn bộ release gate |
| `npm run deployment:prepare:studionet` | Tạo Studionet artifact |
| `npm run deployment:prepare:bradbury` | Tạo Bradbury artifact |
| `npm run deployment:record -- ...` | Verify và ghi nhận factory mới |
| `npm run deployment:show` | Sinh lại bảng active deployments |

---

## Tài liệu

- [`docs/architecture.md`](docs/architecture.md) — workflow và trust boundaries.
- [`docs/requirements-matrix.md`](docs/requirements-matrix.md) — ma trận yêu cầu/evidence.
- [`docs/deployment-evidence.md`](docs/deployment-evidence.md) — quy trình evidence.
- [`docs/steward-response.md`](docs/steward-response.md) — phản hồi kỹ thuật.
- [`deployments/ACTIVE.md`](deployments/ACTIVE.md) — bảng deployment được sinh tự động.

---

## Push lên GitHub

Trước khi commit:

```bash
npm run release:check
git status --short
```

Đảm bảo không có `.env.local`, private keys, `.next`, `dist` hoặc Python caches trong commit.

Tạo repository trống trên GitHub, sau đó:

```bash
git init
git branch -M main
git add -A
git commit -m "feat: complete ProofGrid contracts and deployment automation"
git remote add origin https://github.com/<YOUR_USERNAME>/proofgrid.git
git push -u origin main
```

Nếu remote đã tồn tại:

```bash
git remote set-url origin https://github.com/<YOUR_USERNAME>/proofgrid.git
git push -u origin main
```

Hoặc dùng GitHub CLI:

```bash
gh auth login
gh repo create proofgrid --public --source=. --remote=origin --push
```

---

## License

MIT
