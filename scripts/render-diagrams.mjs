#!/usr/bin/env node
// Re-extracts the Mermaid blocks from docs/architecture.md and renders them to SVG, so the
// committed diagrams cannot drift from the document they came from (docs/plan.md T-091).
//
//   node scripts/render-diagrams.mjs
//
// architecture.md stays the single source of truth; the .mmd files are extracted, never edited.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs", "diagrams");

// Order matters: these names map positionally onto the fenced mermaid blocks in architecture.md.
const NAMES = ["01-system-architecture", "02-furnishing-flow", "03-pull-flow", "04-consent-flow"];

const source = readFileSync(join(root, "docs", "architecture.md"), "utf8");
const blocks = [...source.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1].trimEnd());

if (blocks.length !== NAMES.length) {
  console.error(
    `architecture.md has ${blocks.length} mermaid blocks but ${NAMES.length} names are configured.\n` +
      "Add the new diagram's name to NAMES in this script (order follows the document).",
  );
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

for (const [i, name] of NAMES.entries()) {
  const mmd = join(outDir, `${name}.mmd`);
  writeFileSync(mmd, `${blocks[i]}\n`);

  const svg = join(outDir, `${name}.svg`);
  process.stdout.write(`rendering ${name}… `);
  execFileSync("npx", ["-y", "@mermaid-js/mermaid-cli", "-i", mmd, "-o", svg, "-b", "transparent"], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  console.log("done");
}

console.log(`\n${NAMES.length} diagrams written to docs/diagrams/`);
