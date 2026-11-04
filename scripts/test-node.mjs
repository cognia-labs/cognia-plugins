#!/usr/bin/env node
// Run every suite written for `node:test` (scripts/node-test-suites.cjs).
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const { nodeTestSuites } = require("./node-test-suites.cjs")
const { files: hostOwned } = require("../host-integration-tests.json")
const suites = nodeTestSuites(root, hostOwned)
if (suites.length === 0) {
  console.error("[test:node] no node:test suites found")
  process.exit(1)
}
const run = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), ...suites], {
  cwd: root,
  stdio: "inherit",
})
process.exit(run.status ?? 1)
