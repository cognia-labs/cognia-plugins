// Suites written for Node's built-in runner (`node:test`): every script test
// under scripts/, and the plugin `.test.mjs` files that import `node:test`.
// Jest would collect the plugin ones as empty or break on their native ESM
// (top-level await), so jest.config.cjs leaves them out and `pnpm test:node`
// runs exactly this set. Host-owned tests (host-integration-tests.json) are
// never part of it. The Host's Jest still collects the plugin ones; this
// repository runs them as written.
const { readdirSync, readFileSync } = require("node:fs")
const { join, relative, sep } = require("node:path")

const SKIP = new Set(["node_modules", "vendor", "dist", "target", ".venv", "build"])
const NODE_TEST_IMPORT = /\bfrom\s+["']node:test["']|\brequire\(\s*["']node:test["']\s*\)/

function collect(root, directory, keep) {
  const found = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) walk(path)
      } else if (/\.test\.mjs$/.test(entry.name) && keep(path)) {
        found.push(relative(root, path).split(sep).join("/"))
      }
    }
  }
  walk(join(root, directory))
  return found
}

/** Plugin `.test.mjs` suites that import `node:test`. */
function pluginNodeTestSuites(root) {
  return collect(root, "plugins", (path) => NODE_TEST_IMPORT.test(readFileSync(path, "utf8"))).sort()
}

/** Everything `pnpm test:node` runs: script tests plus plugin node suites, minus Host-owned files. */
function nodeTestSuites(root, hostOwned = []) {
  const excluded = new Set(hostOwned)
  return [...collect(root, "scripts", () => true), ...pluginNodeTestSuites(root)]
    .filter((file) => !excluded.has(file))
    .sort()
}

module.exports = { nodeTestSuites, pluginNodeTestSuites }
