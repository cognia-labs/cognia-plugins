#!/usr/bin/env node
// Run the Python plugins' pytest suites against the pinned kit's Python SDK
// wheel. The plugins' conftest.py files add the Host's `plugin-sdk/python/src`
// when it exists; here the SDK comes from the kit instead. `--frozen` keeps a
// uv resolve from rewriting a plugin's committed uv.lock.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { KIT_DIR } from "./bootstrap.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/** The kit's Python SDK wheel, relative to the repository root. */
export function sdkWheel(rootDirectory = root) {
  const wheels = fs
    .readdirSync(path.join(rootDirectory, KIT_DIR))
    .filter((name) => /^cognia_plugin_sdk-.+\.whl$/.test(name))
  if (wheels.length !== 1)
    throw new Error(`Expected one Python SDK wheel in ${KIT_DIR}, found ${wheels.length}; run pnpm bootstrap`)
  return path.join(KIT_DIR, wheels[0])
}

/** One uv invocation per Python plugin suite. */
export function pytestRuns(wheel) {
  return [
    ["run", "--frozen", "--project", "plugins/repowiki", "--with", "pytest", "--with", "pytest-asyncio",
      "--with", wheel, "python", "-m", "pytest", "plugins/repowiki/tests"],
    ["run", "--no-project", "--with", "pytest", "--with", wheel,
      "python", "-m", "pytest", "plugins/cognia-laya-guard/tests"],
  ]
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const args of pytestRuns(sdkWheel())) {
    const run = spawnSync("uv", [...args, ...process.argv.slice(2)], { cwd: root, stdio: "inherit" })
    if (run.status !== 0) process.exit(run.status ?? 1)
  }
}
