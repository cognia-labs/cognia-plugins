import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { KIT_DIR } from "./bootstrap.mjs"
import { pytestRuns, sdkWheel } from "./test-python.mjs"

test("finds exactly one SDK wheel in the kit", async () => {
  const root = await mkdtemp(join(tmpdir(), "cognia-plugins-wheel-"))
  try {
    await mkdir(join(root, KIT_DIR), { recursive: true })
    assert.throws(() => sdkWheel(root), /found 0/)
    await writeFile(join(root, KIT_DIR, "cognia_plugin_sdk-0.3.0-py3-none-any.whl"), "")
    await writeFile(join(root, KIT_DIR, "cognia-plugin-sdk-0.3.0.tgz"), "")
    assert.equal(sdkWheel(root), join(KIT_DIR, "cognia_plugin_sdk-0.3.0-py3-none-any.whl"))
    await writeFile(join(root, KIT_DIR, "cognia_plugin_sdk-0.4.0-py3-none-any.whl"), "")
    assert.throws(() => sdkWheel(root), /found 2/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("every pytest run uses the kit wheel and never re-locks", () => {
  const runs = pytestRuns("kit.whl")
  assert.equal(runs.length, 2)
  for (const args of runs) {
    assert.ok(args.includes("kit.whl"))
    assert.ok(args.includes("--frozen") || args.includes("--no-project"))
  }
})
