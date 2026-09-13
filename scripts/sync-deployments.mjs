#!/usr/bin/env node
// Fans the addresses from a `forge script Deploy` run out into every package's env file, so the
// one thing a human does by hand (deploying) propagates without hand-copying five addresses
// into four files and getting one wrong.
//
//   node scripts/sync-deployments.mjs                 # picks the newest docs/deployments.*.json
//   node scripts/sync-deployments.mjs --chain 11155111
//   node scripts/sync-deployments.mjs --dry-run
//
// Existing keys are updated in place and everything else in each file is preserved, so running
// it twice is a no-op and it never clobbers secrets you have already filled in.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const CONTRACT_ENV_KEYS = {
  SubjectRegistry: "SUBJECT_REGISTRY_ADDRESS",
  FurnisherRegistry: "FURNISHER_REGISTRY_ADDRESS",
  ReciprocityLedger: "RECIPROCITY_LEDGER_ADDRESS",
  ExposureCommitments: "EXPOSURE_COMMITMENTS_ADDRESS",
  VerdictAttestations: "VERDICT_ATTESTATIONS_ADDRESS",
};

function parseArgs(argv) {
  const chainIndex = argv.indexOf("--chain");
  return {
    chainId: chainIndex === -1 ? undefined : argv[chainIndex + 1],
    dryRun: argv.includes("--dry-run"),
  };
}

function findDeploymentsFile(chainId) {
  const docs = join(root, "docs");
  if (chainId) {
    const path = join(docs, `deployments.${chainId}.json`);
    if (!existsSync(path)) {
      throw new Error(`No ${path}. Run contracts/script/Deploy.s.sol against chain ${chainId} first.`);
    }
    return path;
  }

  const candidates = readdirSync(docs)
    .filter((f) => /^deployments\.\d+\.json$/.test(f))
    .map((f) => ({ file: join(docs, f), mtime: statSync(join(docs, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (candidates.length === 0) {
    throw new Error(
      "No docs/deployments.<chainId>.json found. Deploy first:\n" +
        "  cd contracts && DEPLOYER_PRIVATE_KEY=0x... CRE_SIGNER_ADDRESS=0x... \\\n" +
        "    forge script script/Deploy.s.sol:Deploy --rpc-url $SEPOLIA_RPC_URL --broadcast",
    );
  }
  return candidates[0].file;
}

/** Merges `updates` into a dotenv file, preserving comments, order and untouched keys. */
function mergeEnvFile(path, updates, dryRun) {
  const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n") : [];
  const remaining = new Map(Object.entries(updates));
  const changed = [];

  const merged = lines.map((line) => {
    const match = /^(\s*)([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match) return line;
    const [, indent, key, currentValue] = match;
    if (!remaining.has(key)) return line;

    const value = remaining.get(key);
    remaining.delete(key);
    if (currentValue === value) return line;
    changed.push(key);
    return `${indent}${key}=${value}`;
  });

  if (remaining.size > 0) {
    if (merged.length > 0 && merged[merged.length - 1].trim() !== "") merged.push("");
    merged.push("# Added by scripts/sync-deployments.mjs");
    for (const [key, value] of remaining) {
      merged.push(`${key}=${value}`);
      changed.push(key);
    }
  }

  if (changed.length > 0 && !dryRun) {
    writeFileSync(path, merged.join("\n"));
  }
  return changed;
}

/**
 * Rewrites each named data source's `address` in the Sepolia manifest, and sets `startBlock` to
 * the deployment block when the deployments file records one. Operates on the YAML text rather
 * than parsing and re-emitting it, so comments and formatting survive.
 */
function updateSepoliaManifest(path, deployments, dryRun) {
  if (!existsSync(path)) return [];

  let text = readFileSync(path, "utf8");
  const changed = [];

  for (const name of ["ExposureCommitments", "ReciprocityLedger", "VerdictAttestations"]) {
    const address = deployments[name];
    if (!address) continue;

    // Match the `address:` line inside this data source's `source:` block specifically.
    const pattern = new RegExp(
      `(name:\\s*${name}\\b[\\s\\S]*?address:\\s*)"0x[0-9a-fA-F]{40}"([^\\n]*)`,
    );
    if (!pattern.test(text)) continue;

    const before = text;
    text = text.replace(pattern, `$1"${address}"`);
    if (text !== before) changed.push(name);
  }

  if (deployments.startBlock) {
    const before = text;
    text = text.replace(/startBlock:\s*\d+[^\n]*/g, `startBlock: ${deployments.startBlock}`);
    if (text !== before) changed.push("startBlock");
  }

  if (changed.length > 0 && !dryRun) writeFileSync(path, text);
  return changed;
}

function main() {
  const { chainId, dryRun } = parseArgs(process.argv.slice(2));
  const deploymentsPath = findDeploymentsFile(chainId);
  const deployments = JSON.parse(readFileSync(deploymentsPath, "utf8"));

  const missing = Object.keys(CONTRACT_ENV_KEYS).filter((name) => !deployments[name]);
  if (missing.length > 0) {
    throw new Error(`${deploymentsPath} is missing: ${missing.join(", ")}`);
  }

  const addressEnv = Object.fromEntries(
    Object.entries(CONTRACT_ENV_KEYS).map(([name, key]) => [key, deployments[name]]),
  );
  // 31337 is local Anvil; anything else is a real network the API should treat as Sepolia-like.
  addressEnv.CHAIN_ID = String(deployments.chainId);

  const targets = [
    { path: join(root, "api", ".env"), updates: addressEnv },
    { path: join(root, "console", ".env.local"), updates: {} },
    { path: join(root, "demo-lenders", "lender-a", ".env.local"), updates: {} },
    { path: join(root, "demo-lenders", "lender-b", ".env.local"), updates: {} },
  ];

  // The workflow public key lives with the CRE project; propagate it when keygen has run.
  const creConfigPath = join(root, "cre", "hardpull", "config.staging.json");
  if (existsSync(creConfigPath)) {
    const publicKey = JSON.parse(readFileSync(creConfigPath, "utf8")).workflowPublicKeyHex;
    if (publicKey && !/^0+$/.test(publicKey)) {
      targets[0].updates.CRE_WORKFLOW_PUBLIC_KEY_HEX = publicKey;
      targets[1].updates.NEXT_PUBLIC_CRE_WORKFLOW_PUBLIC_KEY_HEX = publicKey;
      targets[2].updates.NEXT_PUBLIC_CRE_WORKFLOW_PUBLIC_KEY_HEX = publicKey;
    }
  }

  console.log(`Source: ${deploymentsPath} (chainId ${deployments.chainId})${dryRun ? " [dry run]" : ""}\n`);
  for (const { path, updates } of targets) {
    if (Object.keys(updates).length === 0) continue;
    const changed = mergeEnvFile(path, updates, dryRun);
    const relative = path.slice(root.length + 1);
    console.log(changed.length === 0 ? `  = ${relative} (already current)` : `  ✓ ${relative}: ${changed.join(", ")}`);
  }

  // The Sepolia subgraph manifest indexes the same contracts, so it needs the same addresses.
  // Only touched for a real network -- pointing a subgraph at an ephemeral Anvil address is
  // never what anyone wants.
  if (String(deployments.chainId) !== "31337") {
    const manifestPath = join(root, "subgraph", "subgraph.sepolia.yaml");
    const changed = updateSepoliaManifest(manifestPath, deployments, dryRun);
    console.log(
      changed.length === 0
        ? "  = subgraph/subgraph.sepolia.yaml (already current)"
        : `  ✓ subgraph/subgraph.sepolia.yaml: ${changed.join(", ")}`,
    );
  }

  if (String(deployments.chainId) === "31337") {
    console.log("\nNote: chainId 31337 is a local Anvil deployment; these addresses are ephemeral.");
  }
}

try {
  main();
} catch (err) {
  console.error(`sync-deployments: ${err.message}`);
  process.exit(1);
}
