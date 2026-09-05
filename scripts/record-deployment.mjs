#!/usr/bin/env node
/**
 * Verify and activate a freshly deployed factory as the project's only address
 * for one network.
 *
 * Usage:
 *   npm run deployment:record -- \
 *     --network studionet \
 *     --address 0x... \
 *     --tx 0x...
 *
 * The command refuses to update configuration unless:
 *   - the deployment transaction is FINALIZED and did not fail;
 *   - deployed source is byte-identical to contracts/task_factory.py;
 *   - its embedded child is byte-identical to contracts/task_verifier.py;
 *   - the factory self-reports the supplied address;
 *   - required custody, registry and settlement views work.
 *
 * On success it updates the single committed manifest, source archive,
 * .env.local, .env.example and generated deployments/ACTIVE.md.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const network = arg("network");
const address = arg("address");
const txHash = arg("tx");
if (
  !["studionet", "bradbury"].includes(network) ||
  !/^0x[0-9a-fA-F]{40}$/.test(address ?? "") ||
  !/^0x[0-9a-fA-F]{64}$/.test(txHash ?? "")
) {
  console.error(
    "usage: npm run deployment:record -- --network studionet|bradbury " +
      "--address 0x<40 hex> --tx 0x<64 hex>"
  );
  process.exit(2);
}

const chain = network === "studionet" ? studionet : testnetBradbury;
const client = createClient({ chain });
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const factoryPath = path.join(ROOT, "contracts/task_factory.py");
const verifierPath = path.join(ROOT, "contracts/task_verifier.py");
const canonicalFactory = readFileSync(factoryPath, "utf8");
const canonicalVerifier = readFileSync(verifierPath, "utf8");
const canonicalFactoryHash = sha256(canonicalFactory);
const canonicalVerifierHash = sha256(canonicalVerifier);

console.log(`[1/6] verify finalized deployment transaction ${txHash}`);
const receipt = await client.waitForTransactionReceipt({
  hash: txHash,
  status: TransactionStatus.FINALIZED,
  retries: 20,
  interval: 3000,
  fullTransaction: true,
});
const leader =
  receipt?.consensus_data?.leader_receipt?.[0] ??
  receipt?.consensusData?.leaderReceipt?.[0];
const execution = receipt?.txExecutionResultName ?? leader?.execution_result;
if (execution && !["FINISHED_WITH_RETURN", "SUCCESS"].includes(String(execution))) {
  throw new Error(`deployment transaction execution failed: ${execution}`);
}
const receiptAddress =
  receipt?.data?.contract_address ??
  receipt?.data?.contractAddress ??
  receipt?.contractAddress;
if (receiptAddress && String(receiptAddress).toLowerCase() !== address.toLowerCase()) {
  throw new Error(`deployment receipt address ${receiptAddress} does not match ${address}`);
}

console.log("[2/6] compare deployed source and embedded child");
const deployedFactory = await client.getContractCode(address);
const deployedFactoryHash = sha256(deployedFactory);
if (deployedFactoryHash !== canonicalFactoryHash) {
  throw new Error(
    `factory source mismatch: deployed=${deployedFactoryHash} repository=${canonicalFactoryHash}`
  );
}
const deployedChildB64 =
  deployedFactory.match(/TASK_VERIFIER_CODE_B64 = "([^"]*)"/)?.[1] ?? "";
if (!deployedChildB64) throw new Error("deployed factory has no embedded child source");
const deployedVerifier = Buffer.from(deployedChildB64, "base64").toString("utf8");
const deployedVerifierHash = sha256(deployedVerifier);
if (deployedVerifierHash !== canonicalVerifierHash || deployedVerifier !== canonicalVerifier) {
  throw new Error(
    `embedded child mismatch: deployed=${deployedVerifierHash} repository=${canonicalVerifierHash}`
  );
}

console.log("[3/6] verify factory identity and required reads");
const read = (functionName, callArgs = []) =>
  client.readContract({ address, functionName, args: callArgs });
const zero = "0x0000000000000000000000000000000000000001";
const [self, releaseWindow, taskCount, tasks, unknownEscrow, unknownSettlement] =
  await Promise.all([
    read("get_factory_address"),
    read("get_release_window"),
    read("get_task_count"),
    read("get_all_tasks"),
    read("get_escrow_status", [zero]),
    read("get_settlement_status", [zero]),
  ]);
if (String(self).toLowerCase() !== address.toLowerCase()) {
  throw new Error(`factory self-reports ${self}, expected ${address}`);
}
if (Number(releaseWindow) !== 86400 || Number(taskCount) !== tasks.length) {
  throw new Error("factory release-window or registry invariant failed");
}
if (
  !("creator" in unknownEscrow) ||
  !("created_at" in unknownEscrow) ||
  unknownSettlement.known !== false
) {
  throw new Error("factory does not expose the required custody/settlement schema");
}

console.log("[4/6] archive deployed source and update manifest");
const manifestPath = path.join(ROOT, "deployments/deployments.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const archiveRel = `deployments/sources/${deployedFactoryHash}`;
const archiveDir = path.join(ROOT, archiveRel);
mkdirSync(archiveDir, { recursive: true });
writeFileSync(path.join(archiveDir, "task_factory.py"), deployedFactory);
writeFileSync(path.join(archiveDir, "task_verifier.py"), deployedVerifier);

manifest.generatedAt = new Date().toISOString();
manifest.source = {
  factoryPath: "contracts/task_factory.py",
  factorySha256: canonicalFactoryHash,
  verifierPath: "contracts/task_verifier.py",
  verifierSha256: canonicalVerifierHash,
  embeddedVerifierSha256: deployedVerifierHash,
  embeddedVerifierMatches: true,
  testSuite: "python3 contracts/tests/test_proofgrid.py",
};
manifest.networks[network] = {
  ...manifest.networks[network],
  activeFactory: address,
  activeFactorySourceSha256: deployedFactoryHash,
  activeVerifierSourceSha256: deployedVerifierHash,
  sourceArchive: archiveRel,
  deploymentTx: txHash,
  status: "ACTIVE_SOURCE_VERIFIED",
  verifiedAt: new Date().toISOString(),
  verifiedReads: {
    get_factory_address: String(self),
    get_release_window: Number(releaseWindow),
    get_task_count: Number(taskCount),
    get_all_tasks: tasks,
    get_escrow_status_unknown: unknownEscrow,
    get_settlement_status_unknown: unknownSettlement,
  },
  note: "Current live factory; address, finalized transaction, source and required reads verified.",
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

function upsertEnv(filePath, key, value, template = false) {
  let content = existsSync(filePath)
    ? readFileSync(filePath, "utf8")
    : template
      ? "# Generated active ProofGrid deployment configuration.\nNEXT_PUBLIC_DEFAULT_NETWORK=studionet\n"
      : "NEXT_PUBLIC_DEFAULT_NETWORK=studionet\n";
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  content = re.test(content) ? content.replace(re, line) : `${content.trim()}\n${line}\n`;
  writeFileSync(filePath, content.endsWith("\n") ? content : content + "\n");
}
const envKey =
  network === "studionet"
    ? "NEXT_PUBLIC_STUDIONET_FACTORY"
    : "NEXT_PUBLIC_BRADBURY_FACTORY";

console.log("[5/6] update local and example environment files");
upsertEnv(path.join(ROOT, ".env.local"), envKey, address);
upsertEnv(path.join(ROOT, ".env.example"), envKey, address, true);

console.log("[6/6] regenerate active deployment documentation");
execFileSync(process.execPath, [path.join(ROOT, "scripts/render-deployments.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
});

console.log("\ndeployment recorded successfully");
console.log(`  network       ${network} (${chain.id})`);
console.log(`  factory       ${address}`);
console.log(`  transaction   ${txHash}`);
console.log(`  factory sha   ${deployedFactoryHash}`);
console.log(`  verifier sha  ${deployedVerifierHash}`);
console.log(`  task count    ${taskCount}`);
console.log("\nCommit deployments/deployments.json, deployments/ACTIVE.md, .env.example and source archive, then redeploy the frontend.");
