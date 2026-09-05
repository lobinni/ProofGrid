#!/usr/bin/env node
/**
 * Proves that what the app routes to is what was submitted.
 *
 *   node scripts/verify-deployment.mjs            # all configured networks
 *   node scripts/verify-deployment.mjs studionet  # one network
 *
 * Prints, per network: the factory address the frontend uses, the address the
 * factory reports for itself, the source hashes of the deployed sources, and
 * matching factory / child-state / escrow / settlement reads for every task.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const manifest = JSON.parse(readFileSync(path.join(ROOT, "deployments/deployments.json"), "utf8"));
const factorySrc = readFileSync(path.join(ROOT, "contracts/task_factory.py"), "utf8");
const verifierSrc = readFileSync(path.join(ROOT, "contracts/task_verifier.py"), "utf8");
const embeddedB64 = (factorySrc.match(/TASK_VERIFIER_CODE_B64 = "([^"]*)"/) || [])[1] || "";
const embeddedSrc = Buffer.from(embeddedB64, "base64").toString("utf8");

const NETWORKS = {
  studionet: {
    label: "GenLayer Studio (Studionet)",
    chain: studionet,
    chainId: 61999,
    explorer: "https://explorer-studio.genlayer.com",
    factory: process.env.NEXT_PUBLIC_STUDIONET_FACTORY || manifest.networks.studionet.activeFactory,
    expectedSourceHash: manifest.networks.studionet.activeFactorySourceSha256,
    expectedVerifierHash: manifest.networks.studionet.activeVerifierSourceSha256,
  },
  bradbury: {
    label: "Asimov / Bradbury Testnet",
    chain: testnetBradbury,
    chainId: 4221,
    explorer: "https://explorer-bradbury.genlayer.com",
    factory: process.env.NEXT_PUBLIC_BRADBURY_FACTORY || manifest.networks.bradbury.activeFactory,
    expectedSourceHash: manifest.networks.bradbury.activeFactorySourceSha256,
    expectedVerifierHash: manifest.networks.bradbury.activeVerifierSourceSha256,
  },
};

const j = (v) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const gen = (wei) => `${Number(BigInt(wei ?? 0)) / 1e18} GEN`;

console.log("=".repeat(78));
console.log("ProofGrid — deployment verification");
console.log("=".repeat(78));
console.log("\nSOURCE HASHES (sha256)");
console.log(`  contracts/task_factory.py    ${sha256(factorySrc)}`);
console.log(`  contracts/task_verifier.py   ${sha256(verifierSrc)}`);
console.log(`  child embedded in factory    ${sha256(embeddedSrc)}`);
console.log(
  `  embedded child matches file  ${embeddedSrc === verifierSrc ? "YES" : "NO — run generate_factory.py"}`
);

const only = process.argv[2];
const targets = Object.entries(NETWORKS).filter(([id]) => !only || id === only);

let failures = 0;

for (const [id, net] of targets) {
  console.log("\n" + "-".repeat(78));
  console.log(`NETWORK  ${net.label}  (chain ${net.chainId})`);
  console.log("-".repeat(78));

  if (!net.factory || /^0x0{40}$/i.test(net.factory)) {
    console.log("  ! no factory configured for this network — skipping");
    failures++;
    continue;
  }

  console.log(`  frontend routes to   ${net.factory}`);
  console.log(`  explorer             ${net.explorer}/address/${net.factory}`);

  const client = createClient({ chain: net.chain });
  const read = (address, functionName, args = []) =>
    client.readContract({ address, functionName, args });

  try {
    const deployedSource = await client.getContractCode(net.factory);
    const deployedHash = sha256(deployedSource);
    const sourceMatch = !!net.expectedSourceHash && deployedHash === net.expectedSourceHash;
    console.log(`  deployed source sha ${deployedHash}`);
    console.log(`  manifest source sha ${net.expectedSourceHash ?? "NOT RECORDED"}`);
    console.log(`  source alignment    ${sourceMatch ? "MATCH" : "MISMATCH"}`);
    if (!sourceMatch) failures++;

    const deployedChildB64 = deployedSource.match(/TASK_VERIFIER_CODE_B64 = "([^"]*)"/)?.[1] ?? "";
    const deployedChildHash = sha256(Buffer.from(deployedChildB64, "base64").toString("utf8"));
    const childMatch = !!net.expectedVerifierHash && deployedChildHash === net.expectedVerifierHash;
    console.log(`  embedded child sha  ${deployedChildHash}`);
    console.log(`  manifest child sha  ${net.expectedVerifierHash ?? "NOT RECORDED"}`);
    console.log(`  child alignment     ${childMatch ? "MATCH" : "MISMATCH"}`);
    if (!childMatch) failures++;

    let selfReported = "(not exposed)";
    try {
      selfReported = await read(net.factory, "get_factory_address", []);
      const match = String(selfReported).toLowerCase() === String(net.factory).toLowerCase();
      console.log(`  factory self-reports ${selfReported}  ${match ? "MATCH" : "MISMATCH"}`);
      if (!match) failures++;
    } catch {
      console.log("  factory self-reports (older factory without get_factory_address)");
    }

    const window = await read(net.factory, "get_release_window", []);
    const count = await read(net.factory, "get_task_count", []);
    const tasks = await read(net.factory, "get_all_tasks", []);
    console.log(`  release window       ${window}s`);
    console.log(`  task count           ${count}  (registry length ${tasks.length})`);

    if (Number(count) !== tasks.length) {
      console.log("  ! task_count disagrees with get_all_tasks()");
      failures++;
    }

    let stranded = 0n;
    for (const [i, addr] of tasks.entries()) {
      console.log(`\n  [${i + 1}/${tasks.length}] child ${addr}`);

      let escrowPre = null;
      try {
        escrowPre = await read(net.factory, "get_escrow_status", [addr]);
      } catch { /* reported below */ }

      let state;
      try {
        state = await read(addr, "get_task_state", []);
      } catch (err) {
        const held = BigInt(escrowPre?.locked_amount ?? 0);
        const released = escrowPre?.released ?? false;
        if (held > 0n && !released) stranded += held;
        console.log(`      ORPHAN: no contract at this address (${err?.shortMessage ?? err?.message})`);
        console.log(`      escrow (factory) ${gen(held)} released=${released}` +
          (held > 0n && !released ? "   <-- STRANDED: registry entry with no child" : ""));
        failures++;
        continue;
      }
      const escrow = escrowPre ?? (await read(net.factory, "get_escrow_status", [addr]));

      let settlement = null;
      try {
        settlement = await read(addr, "get_settlement", []);
      } catch {
        /* older child */
      }
      let factorySettlement = null;
      try {
        factorySettlement = await read(net.factory, "get_settlement_status", [addr]);
      } catch {
        /* older factory */
      }

      console.log(`      title            ${state.title}`);
      console.log(`      status           ${state.status}`);
      console.log(`      creator          ${state.creator}`);
      console.log(`      worker           ${state.worker || "(unclaimed)"}`);
      console.log(`      child->factory   ${state.factory}`);
      console.log(`      reward (child)   ${state.reward_amount} GEN`);
      console.log(`      escrow (factory) ${gen(escrow.locked_amount)} released=${escrow.released}` +
        (escrow.paid_to ? ` paid_to=${escrow.paid_to}` : ""));
      if (settlement) console.log(`      child settlement  ${j(settlement)}`);
      if (factorySettlement) console.log(`      factory settlement ${j(factorySettlement)}`);

      // Cross-checks the Steward asked to see demonstrated.
      const boundOk = String(state.factory).toLowerCase() === String(net.factory).toLowerCase();
      const amountOk = Number(BigInt(escrow.locked_amount ?? 0)) / 1e18 === Number(state.reward_amount);
      const settleOk =
        !settlement || !factorySettlement ||
        (String(settlement.recipient) === String(factorySettlement.recipient) &&
          String(settlement.reason) === String(factorySettlement.reason));

      console.log(
        `      cross-check      binding=${boundOk ? "ok" : "FAIL"} ` +
          `escrow==reward=${amountOk ? "ok" : "FAIL"} ` +
          `child==factory-settlement=${settleOk ? "ok" : "FAIL"}`
      );
      if (!boundOk || !amountOk || !settleOk) failures++;
    }
    if (stranded > 0n) {
      console.log(`\n  ** ${gen(stranded)} of escrow is stranded behind orphaned registry entries **`);
    }
  } catch (err) {
    console.log(`  ! read failed: ${err?.shortMessage ?? err?.message ?? err}`);
    failures++;
  }
}

console.log("\n" + "=".repeat(78));
console.log(failures === 0 ? "All checks passed." : `${failures} check(s) need attention.`);
process.exit(failures === 0 ? 0 : 1);
