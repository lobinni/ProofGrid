// Contract interaction helpers for TaskFactory + its TaskVerifier children.
//
// Transport is genlayer-js against the selected network's deployed factory:
//  - reads  -> the network's GenLayer RPC (no wallet needed)
//  - writes -> signed by the connected MetaMask account (genlayer-js routes
//    eth_sendTransaction to window.ethereum when the client is created with an
//    address-only account)

import { createClient as createGenlayerClient } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";
import { NETWORKS, assertNetworkConfigured, type NetworkId } from "@/lib/networks";

// ---------------------------------------------------------------------------
// Types - the shapes the contracts return (snake_case at the calldata boundary)
// ---------------------------------------------------------------------------

export interface ContractTaskState {
  creator: string;
  factory: string;
  title: string;
  category: string;
  category_other: string;
  priority: string;
  estimated_effort: string;
  description: string;
  criteria: string;
  submission_format: string;
  submission_format_other: string;
  reward_amount: number; // whole GEN units
  deadline: number;
  worker: string;
  submission_url: string;
  submission_note: string;
  status: "open" | "claimed" | "submitted" | "verified" | "rejected" | "disputed" | "cancelled" | "expired";
  verification_result: string;
  dispute_count: number;
  dispute_reason: string;
  created_at: number;
  verified_at: number;
  settled_at: number;
  release_window: number;
  chain_time: number;
}

export interface SettlementStatus {
  known: boolean;
  settleable: boolean;
  recipient: string;
  reason: string;
  readyAt: number;
  released: boolean;
  lockedAmount: number;
}

// Matches the contract's redaction sentinel in get_task_state() - evidence is
// only visible to the task's creator/worker, everyone else sees this instead.
export const PRIVATE_EVIDENCE = "[private]";

export interface VerificationResult {
  verified: boolean;
  confidence: number;
  reasoning: string;
  validators?: Array<{ id: string; model: string; verdict: "verified" | "rejected"; confidence: number }>;
  rounds?: number;
}

export interface EscrowStatus {
  lockedAmount: number;
  released: boolean;
  paidTo: string;
  creator: string;
  createdAt: number;
  active: boolean;
}

export interface CreateTaskInput {
  title: string;
  category: string;
  categoryOther: string;
  priority: string;
  estimatedEffort: string;
  description: string;
  criteria: string;
  submissionFormat: string;
  submissionFormatOther: string;
  rewardAmount: number;
  deadlineUnixSeconds: number;
}

export interface TxReceipt {
  hash: string;
  status: string;
  status_name?: string;
  txExecutionResultName?: string;
  consensus_data?: { leader_receipt?: Array<{ execution_result?: string }> };
  detail?: string;
  functionName?: string;
  contractAddress?: string;
  returnValue?: string;
}

interface CallArgs {
  address: string;
  functionName: string;
  args?: unknown[];
  value?: string | number;
}

export interface ChainClient {
  network: NetworkId;
  account: string;
  readContract(call: CallArgs & { account?: string }): Promise<any>;
  writeContract(call: CallArgs): Promise<string>;
  waitForTransactionReceipt(opts: { hash: string }): Promise<TxReceipt>;
}

// ---------------------------------------------------------------------------
// genlayer-js client cache (keyed by network + account)
// ---------------------------------------------------------------------------

const genlayerClients = new Map<string, ReturnType<typeof createGenlayerClient>>();

function getGenlayerClient(network: NetworkId, account?: string) {
  const cfg = assertNetworkConfigured(network);
  const key = `${network}:${account ?? ""}`;
  let client = genlayerClients.get(key);
  if (!client) {
    client = createGenlayerClient({
      chain: cfg.chain,
      ...(account ? { account: account as `0x${string}` } : {}),
    });
    genlayerClients.set(key, client);
  }
  return client;
}

// A transaction can reach ACCEPTED while the contract call itself failed (most
// visible on the AI-verification consensus path). Check the leader's execution
// result rather than trusting "ACCEPTED" alone.
function assertTxSucceeded(receipt: TxReceipt, action: string) {
  const leaderResult = receipt?.consensus_data?.leader_receipt?.[0]?.execution_result;
  const execResultName = receipt?.txExecutionResultName;
  const failed =
    (leaderResult && leaderResult !== "SUCCESS") ||
    (execResultName && execResultName !== "FINISHED_WITH_RETURN") ||
    receipt?.status_name === "UNDETERMINED";
  if (failed) {
    const detail = receipt?.detail ? `: ${receipt.detail}` : "";
    throw new Error(
      `${action} did not complete (${leaderResult ?? execResultName ?? receipt?.status_name})${detail}`
    );
  }
}

function normalizeReceipt(raw: Record<string, any>, hash: string): TxReceipt {
  const consensus = raw.consensus_data ?? raw.consensusData ?? {};
  const leader = consensus?.leader_receipt?.[0] ?? consensus?.leaderReceipt?.[0];
  const returnedResult =
    raw.returnValue ??
    raw.return_value ??
    raw.data?.returnValue ??
    raw.data?.return_value ??
    leader?.result;
  let returnValue: string | undefined;
  if (typeof returnedResult === "string") {
    // SDK decoding may return either the bare address or a JSON-quoted one.
    const match = returnedResult.match(/0x[0-9a-fA-F]{40}/);
    if (match) returnValue = match[0];
  } else if (returnedResult && typeof returnedResult === "object") {
    const serialized = JSON.stringify(returnedResult);
    const match = serialized.match(/0x[0-9a-fA-F]{40}/);
    if (match) returnValue = match[0];
  }
  return {
    ...raw,
    hash: raw.hash ?? hash,
    status: typeof raw.status === "string" ? raw.status : "ACCEPTED",
    status_name: raw.status_name ?? raw.statusName ?? (typeof raw.status === "string" ? raw.status : "ACCEPTED"),
    txExecutionResultName: raw.txExecutionResultName ?? raw.txExecutionResult,
    consensus_data: consensus,
    returnValue,
  };
}

// ---------------------------------------------------------------------------
// Client factories
// ---------------------------------------------------------------------------

const readOnlyClients: Partial<Record<NetworkId, ChainClient>> = {};

function makeClient(network: NetworkId, account: string): ChainClient {
  return {
    network,
    account,
    async readContract({ address, functionName, args = [], account: viewer }) {
      // The contract decides what to reveal from the caller's address, so the
      // viewer identity must travel with the read. Without it the creator and
      // the assigned worker would see their own submission redacted.
      const from = (viewer || account || "").trim();
      return getGenlayerClient(network, from || undefined).readContract({
        address: address as `0x${string}`,
        functionName,
        args: args as never,
        ...(from ? { account: from as `0x${string}` } : {}),
      } as never);
    },
    async writeContract({ address, functionName, args = [], value }) {
      if (!account) throw new Error("Connect MetaMask to write to the contract.");
      const hash = (await getGenlayerClient(network, account).writeContract({
        address: address as `0x${string}`,
        functionName,
        args: args as never,
        value: BigInt(value ?? 0),
      } as never)) as unknown as string;
      return hash;
    },
    async waitForTransactionReceipt({ hash }) {
      const receipt = await getGenlayerClient(network, account || undefined).waitForTransactionReceipt({
        hash: hash as `0x${string}`,
        status: TransactionStatus.ACCEPTED,
        retries: 60,
        interval: 5000,
        fullTransaction: false,
      } as never);
      return normalizeReceipt(receipt as Record<string, any>, hash);
    },
  };
}

// Client for reads that don't require a connected wallet (e.g. browsing the board)
export function getReadOnlyClient(network: NetworkId): ChainClient {
  if (!readOnlyClients[network]) readOnlyClients[network] = makeClient(network, "");
  return readOnlyClients[network]!;
}

// Session client bound to the connected wallet - every write signs as `account`.
export function getSessionClient(network: NetworkId, account: string): ChainClient {
  return makeClient(network, account);
}

// ---------------------------------------------------------------------------
// TaskFactory methods (contracts/task_factory.py)
// ---------------------------------------------------------------------------

async function findTriggeredChild(
  network: NetworkId,
  account: string,
  parentHash: string
): Promise<string> {
  const client = getGenlayerClient(network, account);
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const ids = (await client.getTriggeredTransactionIds({
        hash: parentHash as never,
      })) as unknown as string[];
      for (const id of ids ?? []) {
        const tx = (await client.getTransaction({
          hash: id as never,
        })) as unknown as Record<string, unknown>;
        const childAddress = String(tx.to_address ?? tx.toAddress ?? "");
        if (/^0x[0-9a-fA-F]{40}$/.test(childAddress)) return childAddress;
      }
    } catch {
      // Trigger indexing follows consensus; retry against accepted state.
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return "";
}

export async function createTaskViaFactory(
  client: ChainClient,
  network: NetworkId,
  input: CreateTaskInput
): Promise<string> {
  // The reward rides along as native value (atto-GEN) and is locked in escrow
  // by the factory inside the same transaction that deploys the child.
  const valueWei = (BigInt(Math.round(input.rewardAmount)) * BigInt(10) ** BigInt(18)).toString();
  const txHash = await client.writeContract({
    address: NETWORKS[network].factoryAddress,
    functionName: "create_task",
    args: [
      input.title,
      input.category,
      input.categoryOther,
      input.priority,
      input.estimatedEffort,
      input.description,
      input.criteria,
      input.submissionFormat,
      input.submissionFormatOther,
      Math.round(input.rewardAmount),
      input.deadlineUnixSeconds,
    ],
    value: valueWei,
  });
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  assertTxSucceeded(receipt, "Task creation");

  // create_task records custody as PENDING and returns a deterministic child
  // address. It intentionally does not add that address to the public board:
  // an internal deployment can be scheduled yet still fail later.
  let pending = receipt.returnValue ?? "";
  if (!pending) {
    // The factory schedules child deployment as an internal transaction. The
    // SDK can resolve that triggered transaction and its `to_address`.
    pending = await findTriggeredChild(network, client.account, txHash);
  }
  if (!pending) {
    // When the factory exposes a pending-task getter, use it as a last resort.
    try {
      pending = await client.readContract({
        address: NETWORKS[network].factoryAddress,
        functionName: "get_latest_pending_task",
        args: [client.account],
        account: client.account,
      });
    } catch {
      pending = "";
    }
  }
  pending = String(pending ?? "");
  if (!pending) {
    throw new Error("The factory accepted custody but did not return a pending task address.");
  }

  // Wait until the internal deployment really materialises. This is the proof
  // the previous one-phase flow was missing; only then ask MetaMask to activate
  // it in the board registry.
  let childReady = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const state = await getTaskState(client, pending, client.account);
      childReady =
        state.factory.toLowerCase() === NETWORKS[network].factoryAddress.toLowerCase() &&
        state.creator.toLowerCase() === client.account.toLowerCase() &&
        state.reward_amount === Math.round(input.rewardAmount);
      if (childReady) break;
    } catch {
      // Internal deployment is still pending; keep polling accepted state.
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  if (!childReady) {
    throw new Error(
      `The task child did not materialise at ${pending}. Your reward remains attributed to your wallet in the factory and can be reclaimed after the 7-day safety period.`
    );
  }

  await activateTask(client, network, pending);
  return pending;
}

export async function getAllTaskAddresses(network: NetworkId): Promise<string[]> {
  const client = getReadOnlyClient(network);
  return client.readContract({
    address: NETWORKS[network].factoryAddress,
    functionName: "get_all_tasks",
    args: [],
  });
}

export async function getEscrowStatus(network: NetworkId, taskAddress: string): Promise<EscrowStatus> {
  const client = getReadOnlyClient(network);
  const result = await client.readContract({
    address: NETWORKS[network].factoryAddress,
    functionName: "get_escrow_status",
    args: [taskAddress],
  });
  // The factory records escrow in atto-GEN (the attached message value).
  return {
    lockedAmount: Number(result.locked_amount ?? 0) / 1e18,
    released: !!result.released,
    paidTo: String(result.paid_to ?? ""),
    creator: String(result.creator ?? ""),
    createdAt: Number(result.created_at ?? 0),
    active: result.active === undefined ? true : !!result.active,
  };
}

export async function activateTask(
  client: ChainClient,
  network: NetworkId,
  taskAddress: string
): Promise<string> {
  const txHash = await client.writeContract({
    address: NETWORKS[network].factoryAddress,
    functionName: "activate_task",
    args: [taskAddress],
    value: 0,
  });
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  assertTxSucceeded(receipt, "Task activation");
  return txHash;
}

export async function releaseFunds(
  client: ChainClient,
  network: NetworkId,
  taskAddress: string
): Promise<string> {
  const txHash = await client.writeContract({
    address: NETWORKS[network].factoryAddress,
    functionName: "release_funds",
    args: [taskAddress],
    value: 0,
  });
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  assertTxSucceeded(receipt, "Escrow release");
  return txHash;
}

// ---------------------------------------------------------------------------
// TaskVerifier child methods (contracts/task_verifier.py)
// ---------------------------------------------------------------------------

async function writeAndWait(client: ChainClient, call: CallArgs, action: string): Promise<string> {
  const txHash = await client.writeContract({ ...call, value: 0 });
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  assertTxSucceeded(receipt, action);
  return txHash;
}

export function claimTask(client: ChainClient, contractAddress: string) {
  return writeAndWait(client, { address: contractAddress, functionName: "claim_task", args: [] }, "Claim");
}

export function submitWork(client: ChainClient, contractAddress: string, evidenceUrl: string, submissionNote: string) {
  return writeAndWait(
    client,
    { address: contractAddress, functionName: "submit_work", args: [evidenceUrl, submissionNote] },
    "Submit"
  );
}

export function requestVerification(client: ChainClient, contractAddress: string) {
  return writeAndWait(
    client,
    { address: contractAddress, functionName: "request_verification", args: [] },
    "Verification"
  );
}

export function disputeTask(client: ChainClient, contractAddress: string, reason: string) {
  return writeAndWait(client, { address: contractAddress, functionName: "dispute", args: [reason] }, "Dispute");
}

export function cancelTask(client: ChainClient, contractAddress: string) {
  return writeAndWait(client, { address: contractAddress, functionName: "cancel_task", args: [] }, "Cancel");
}

/** Retire a task that ran past its deadline so the escrow can be refunded. */
export function expireTask(client: ChainClient, contractAddress: string) {
  return writeAndWait(client, { address: contractAddress, functionName: "expire_task", args: [] }, "Expire");
}

/** Creator escape hatch for a task whose child never materialised on chain. */
export function reclaimUnresolved(client: ChainClient, network: NetworkId, taskAddress: string) {
  return writeAndWait(
    client,
    { address: NETWORKS[network].factoryAddress, functionName: "reclaim_unresolved", args: [taskAddress] },
    "Reclaim"
  );
}

export async function getSettlementStatus(
  network: NetworkId,
  taskAddress: string
): Promise<SettlementStatus | null> {
  try {
    const result = await getReadOnlyClient(network).readContract({
      address: NETWORKS[network].factoryAddress,
      functionName: "get_settlement_status",
      args: [taskAddress],
    });
    return {
      known: !!result.known,
      settleable: !!result.settleable,
      recipient: String(result.recipient ?? ""),
      reason: String(result.reason ?? ""),
      readyAt: Number(result.ready_at ?? 0),
      released: !!result.released,
      lockedAmount: Number(result.locked_amount ?? 0) / 1e18,
    };
  } catch {
    return null; // factory predates get_settlement_status
  }
}

export async function getTaskState(
  client: ChainClient,
  contractAddress: string,
  viewer?: string
): Promise<ContractTaskState> {
  const result = await client.readContract({
    address: contractAddress,
    functionName: "get_task_state",
    args: [],
    account: viewer ?? client.account,
  });
  // reward_amount/deadline/dispute_count/created_at/verified_at are u256 on-chain
  // and may come back as bigints.
  return {
    ...result,
    reward_amount: Number(result.reward_amount),
    deadline: Number(result.deadline),
    dispute_count: Number(result.dispute_count),
    created_at: Number(result.created_at),
    verified_at: Number(result.verified_at),
    settled_at: Number(result.settled_at ?? 0),
    chain_time: Number(result.chain_time ?? 0),
    // Older factories may not expose this - fall back to the 24h the
    // contracts enforce so the UI never ends up with NaN deadlines.
    release_window: Number(result.release_window) || 86400,
  } as ContractTaskState;
}
