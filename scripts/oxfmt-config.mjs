#!/usr/bin/env bun
// Bridges `package.json#oxfmt` → `.oxfmtrc.json` so oxfmt config can
// live in package.json. Regenerated on every `bun run format`.

import { readFileSync, writeFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync("package.json", "utf8")).oxfmt;
if (!cfg || typeof cfg !== "object") {
  console.error("package.json#oxfmt missing or not an object");
  process.exit(1);
}
writeFileSync(".oxfmtrc.json", JSON.stringify(cfg, null, 2) + "\n");
