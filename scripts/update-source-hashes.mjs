#!/usr/bin/env node
/** Recompute canonical source hashes in deployments/deployments.json. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(ROOT, "deployments/deployments.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const factory = readFileSync(path.join(ROOT, manifest.source.factoryPath), "utf8");
const verifier = readFileSync(path.join(ROOT, manifest.source.verifierPath), "utf8");
const b64 = factory.match(/TASK_VERIFIER_CODE_B64 = "([^"]*)"/)?.[1] ?? "";
const embedded = Buffer.from(b64, "base64").toString("utf8");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

manifest.generatedAt = new Date().toISOString();
manifest.source.factorySha256 = sha256(factory);
manifest.source.verifierSha256 = sha256(verifier);
manifest.source.embeddedVerifierSha256 = sha256(embedded);
manifest.source.embeddedVerifierMatches = embedded === verifier;

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
execFileSync(process.execPath, [path.join(ROOT, "scripts/render-deployments.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
});
console.log(`factory  ${manifest.source.factorySha256}`);
console.log(`verifier ${manifest.source.verifierSha256}`);
console.log(`embedded ${manifest.source.embeddedVerifierSha256}`);
console.log(`match    ${manifest.source.embeddedVerifierMatches}`);
if (!manifest.source.embeddedVerifierMatches) process.exit(1);
