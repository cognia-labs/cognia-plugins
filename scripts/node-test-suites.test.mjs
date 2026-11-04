import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

const { nodeTestSuites, pluginNodeTestSuites } = createRequire(import.meta.url)(
  "./node-test-suites.cjs"
)

test("node suites are script tests plus plugin .test.mjs files importing node:test", async () => {
  const root = await mkdtemp(join(tmpdir(), "cognia-plugins-suites-"))
  try {
    const put = async (path, body) => {
      await mkdir(join(root, path, ".."), { recursive: true })
      await writeFile(join(root, path), body)
    }
    await put("plugins/a/build.test.mjs", 'import { test } from "node:test"\n')
    await put("plugins/b/runtime/probe.test.mjs", "const test = require('node:test')\n")
    await put("plugins/c/build.test.mjs", 'import { test } from "@jest/globals"\n')
    await put("plugins/d/src/index.test.ts", 'import { test } from "node:test"\n')
    await put("plugins/e/vendor/x.test.mjs", 'import { test } from "node:test"\n')
    await put("plugins/f/node_modules/y.test.mjs", 'import { test } from "node:test"\n')
    await put("scripts/build.test.mjs", "")
    await put("scripts/plugin/host-layout.test.mjs", "")
    await put("scripts/build/copied-from-kit.test.mjs", "")
    assert.deepEqual(pluginNodeTestSuites(root), [
      "plugins/a/build.test.mjs",
      "plugins/b/runtime/probe.test.mjs",
    ])
    assert.deepEqual(nodeTestSuites(root, ["scripts/plugin/host-layout.test.mjs"]), [
      "plugins/a/build.test.mjs",
      "plugins/b/runtime/probe.test.mjs",
      "scripts/build.test.mjs",
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
