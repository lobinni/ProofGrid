#!/usr/bin/env node
/**
 * End-to-end demonstration on a live GenLayer network.
 *
 *   node scripts/studionet-e2e.mjs
 *
 * Uses the active TaskFactory recorded in deployments/deployments.json, then
 * exercises settlement paths on the same live contract users interact with.
 * It prints every finalized transaction hash together with before/after escrow
 * reads and recipient balances:
 *
 *   1. create -> cancel -> release            (refund path, settles immediately)
 *   2. create -> claim -> expire -> release   (expiry path, settles immediately)
 *   3. create -> claim -> submit              (AI verdict; release is gated by
 *                                              the 24h challenge window)
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient, createAccount } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NET = (process.argv[2] ?? "studionet").toLowerCase();
const chain = NET === "bradbury" ? testnetBradbury : studionet;
const EXPLORER =
  NET === "bradbury" ? "https://explorer-bradbury.genlayer.com" : "https://explorer-studio.genlayer.com";

// Deploying and paying escrow needs funded accounts. Supply them with
//   CREATOR_PRIVATE_KEY=0x...  WORKER_PRIVATE_KEY=0x...
// (the built-in faucet only exists on localnet). Both need a little GEN;
// the creator also needs the task rewards.
function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(ROOT, file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
      }
    }
  }
}
loadEnv();

const factorySource = readFileSync(path.join(ROOT, "contracts/task_factory.py"), "utf8");
const GEN = 10n ** 18n;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gen = (v) => `${Number(BigInt(v ?? 0)) / 1e18} GEN`;

function client(account) {
  return createClient({ chain, ...(account ? { account } : {}) });
}

async function wait(c, hash, label) {
  const receipt = await c.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    retries: 200,
    interval: 3000,
  });
  const exec = receipt?.txExecutionResultName ?? receipt?.consensus_data?.leader_receipt?.[0]?.execution_result;
  console.log(`    ${label}`);
  console.log(`      hash    ${hash}`);
  console.log(`      status  ${receipt?.statusName ?? receipt?.status}  exec=${exec}`);
  console.log(`      tx      ${EXPLORER}/tx/${hash}`);
  if (exec && !["FINISHED_WITH_RETURN", "SUCCESS"].includes(String(exec))) {
    throw new Error(`${label} did not succeed: ${exec}`);
  }
  return receipt;
}

async function balanceOf(address) {
  const res = await fetch(chain.rpcUrls.default.http[0], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
  }).then((r) => r.json());
  return BigInt(res.result ?? "0x0");
}

const main = async () => {
  console.log("=".repeat(78));
  console.log(`ProofGrid end-to-end on ${NET} (chain ${chain.id})`);
  console.log("=".repeat(78));

  const creatorKey = process.env.CREATOR_PRIVATE_KEY;
  const workerKey = process.env.WORKER_PRIVATE_KEY;
  const creator = creatorKey ? createAccount(creatorKey) : createAccount();
  const worker = workerKey ? createAccount(workerKey) : createAccount();
  console.log(`creator ${creator.address}${creatorKey ? "" : "  (ephemeral — will be unfunded!)"}`);
  console.log(`worker  ${worker.address}${workerKey ? "" : "  (ephemeral — will be unfunded!)"}`);

  const anon = client();
  const cCreator = client(creator);
  const cWorker = client(worker);

  console.log("\n[fund] checking balances");
  let underfunded = false;
  for (const [who, acct] of [["creator", creator], ["worker", worker]]) {
    let bal = await balanceOf(acct.address);
    if (bal === 0n) {
      try {
        await cCreator.fundAccount({ address: acct.address, amount: 500n * GEN });
        await sleep(1500);
        bal = await balanceOf(acct.address);
      } catch {
        /* faucet is localnet-only */
      }
    }
    console.log(`    ${who} ${gen(bal)}`);
    if (bal === 0n) underfunded = true;
  }
  if (underfunded) {
    console.log(
      "\n! One or more accounts hold 0 GEN. On a live network the faucet is not\n" +
      "  available, so deployment and escrow funding will fail with a generic\n" +
      "  ERROR. Set CREATOR_PRIVATE_KEY / WORKER_PRIVATE_KEY to funded accounts\n" +
      "  (export them from MetaMask) and re-run."
    );
    if (!process.env.FORCE) process.exit(2);
  }

  console.log("\n[factory] using the active application contract");
  console.log(`      factory ${factory}`);
  console.log(`      address ${EXPLORER}/address/${factory}`);

  const readF = (fn, args = []) => anon.readContract({ address: factory, functionName: fn, args });
  const readC = (addr, fn, args = []) => anon.readContract({ address: addr, functionName: fn, args });

  const selfReported = await readF("get_factory_address");
  if (String(selfReported).toLowerCase() !== String(factory).toLowerCase()) {
    throw new Error(`factory self-report mismatch: ${selfReported}`);
  }
  console.log(`      self-reports ${selfReported}`);
  console.log(`      source sha ${activeNetwork.activeFactorySourceSha256}`);
  console.log(`      release window ${await readF("get_release_window")}s`);

  const triggeredChild = async (parentHash) => {
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        const ids = await cCreator.getTriggeredTransactionIds({ hash: parentHash });
        for (const id of ids ?? []) {
          const tx = await cCreator.getTransaction({ hash: id });
          const addr = String(tx.to_address ?? tx.toAddress ?? "");
          if (/^0x[0-9a-fA-F]{40}$/.test(addr)) return addr;
        }
      } catch { /* internal message indexing is still catching up */ }
      await sleep(3000);
    }
    return "";
  };

  const now = () => Math.floor(Date.now() / 1000);
  const newTask = async (title, rewardGen, deadlineIn, format = "Live URL") => {
    const hash = await cCreator.writeContract({
      address: factory,
      functionName: "create_task",
      args: [title, "Engineering", "", "Medium", "1 day", `${title} — description`,
        "Deliverable must satisfy the stated criteria.", format, "", rewardGen, now() + deadlineIn],
      value: BigInt(rewardGen) * GEN,
    });
    await wait(cCreator, hash, `create_task "${title}"`);
    const pending = await triggeredChild(hash);
    if (!pending) {
      throw new Error(`could not resolve the child triggered by ${hash}`);
    }

    // Internal deployment is asynchronous. Prove the child exists before the
    // second, permissionless activation transaction puts it on the board.
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        const state = await readC(pending, "get_task_state");
        ready =
          String(state.factory).toLowerCase() === String(factory).toLowerCase() &&
          String(state.creator).toLowerCase() === creator.address.toLowerCase() &&
          Number(state.reward_amount) === Number(rewardGen);
        if (ready) break;
      } catch { /* still materialising */ }
      await sleep(3000);
    }
    if (!ready) throw new Error(`child ${pending} did not materialise; escrow remains reclaimable after grace period`);

    await wait(
      cCreator,
      await cCreator.writeContract({ address: factory, functionName: "activate_task", args: [pending] }),
      `activate_task ${pending}`
    );
    return pending;
  };

  const showEscrow = async (addr, label) => {
    const e = await readF("get_escrow_status", [addr]);
    const s = await readF("get_settlement_status", [addr]);
    console.log(`      ${label}: locked=${gen(e.locked_amount)} released=${e.released}` +
      ` paid_to=${e.paid_to || "-"} | settleable=${s.settleable} reason=${s.reason} recipient=${s.recipient || "-"}`);
    return e;
  };

  // ── 1. cancellation refund ────────────────────────────────────────────────
  console.log("\n[1] create -> cancel -> release (refund path)");
  const t1 = await newTask("Cancellation demo", 2, 7 * 86400);
  console.log(`      child ${t1}`);
  await showEscrow(t1, "before");
  const balBefore1 = await balanceOf(creator.address);

  await wait(cCreator, await cCreator.writeContract({ address: t1, functionName: "cancel_task", args: [] }), "cancel_task");
  console.log(`      child status now: ${(await readC(t1, "get_task_state")).status}`);
  await showEscrow(t1, "after cancel");

  await wait(cWorker, await cWorker.writeContract({ address: factory, functionName: "release_funds", args: [t1] }),
    "release_funds (called by a third party)");
  await showEscrow(t1, "after release");
  const balAfter1 = await balanceOf(creator.address);
  console.log(`      creator balance ${gen(balBefore1)} -> ${gen(balAfter1)}  (delta ${gen(balAfter1 - balBefore1)})`);

  // ── 2. expiry refund ──────────────────────────────────────────────────────
  console.log("\n[2] create -> claim -> expire -> release (expiry path)");
  const t2 = await newTask("Expiry demo", 2, 75);
  console.log(`      child ${t2}`);
  await wait(cWorker, await cWorker.writeContract({ address: t2, functionName: "claim_task", args: [] }), "claim_task");
  await showEscrow(t2, "after claim");

  console.log("      waiting for the deadline to pass…");
  await sleep(80_000);
  await wait(cWorker, await cWorker.writeContract({ address: t2, functionName: "expire_task", args: [] }), "expire_task");
  console.log(`      child status now: ${(await readC(t2, "get_task_state")).status}`);

  const balBefore2 = await balanceOf(creator.address);
  await wait(cWorker, await cWorker.writeContract({ address: factory, functionName: "release_funds", args: [t2] }), "release_funds");
  await showEscrow(t2, "after release");
  const balAfter2 = await balanceOf(creator.address);
  console.log(`      creator balance ${gen(balBefore2)} -> ${gen(balAfter2)}  (delta ${gen(balAfter2 - balBefore2)})`);

  // ── 3. verdict path ───────────────────────────────────────────────────────
  console.log("\n[3] create -> claim -> submit (AI verdict inside submit_work)");
  const t3 = await newTask("Verdict demo", 2, 7 * 86400);
  console.log(`      child ${t3}`);
  await wait(cWorker, await cWorker.writeContract({ address: t3, functionName: "claim_task", args: [] }), "claim_task");
  await wait(
    cWorker,
    await cWorker.writeContract({
      address: t3,
      functionName: "submit_work",
      args: ["https://example.com", "Deliverable is live at the submitted URL."],
    }),
    "submit_work (runs validator consensus)"
  );
  const s3 = await readC(t3, "get_task_state");
  console.log(`      verdict status ${s3.status}`);
  console.log(`      verdict body   ${String(s3.verification_result).slice(0, 240)}`);
  await showEscrow(t3, "after verdict");
  console.log("      (release is gated by the 24h challenge window — re-run release_funds after it elapses)");

  console.log("\n" + "=".repeat(78));
  console.log("SUMMARY");
  console.log(`  factory  ${factory}`);
  console.log(`  tasks    cancel=${t1}  expire=${t2}  verdict=${t3}`);
  console.log(`  explorer ${EXPLORER}/address/${factory}`);
  console.log("=".repeat(78));
};

main().catch((err) => {
  console.error("\nFAILED:", err?.shortMessage ?? err?.message ?? err);
  process.exit(1);
});
