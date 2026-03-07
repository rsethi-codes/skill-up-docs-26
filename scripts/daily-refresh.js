#!/usr/bin/env node
/**
 * One-command daily pipeline:
 * 1) migrate docs to shared assets
 * 2) regenerate roadmap data
 * 3) validate links + integrity
 */

const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

function run(script, args = []) {
  const res = spawnSync(process.execPath, [path.join(ROOT, "scripts", script), ...args], {
    stdio: "inherit",
    cwd: ROOT,
  });
  if (res.status !== 0) {
    process.exit(res.status || 1);
  }
}

function main() {
  run("migrate-doc-to-shared.js");
  run("generate-roadmaps.js");
  run("validate-roadmaps.js");
  console.log("Daily refresh complete.");
}

if (require.main === module) {
  main();
}
