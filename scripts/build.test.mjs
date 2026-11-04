import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { buildAll, frontendPlugins } from "./build.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

test("selects frontend plugins by directory or id and refuses unknown names", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "cognia-plugins-select-"))
  try {
    const put = async (directory, manifest) => {
      await mkdir(join(scratch, "plugins", directory), { recursive: true })
      await writeFile(join(scratch, "plugins", directory, "plugin.json"), JSON.stringify(manifest))
    }
    await put("b-dir", { id: "b-id", type: "frontend" })
    await put("a-dir", { id: "a-id", type: "frontend" })
    await put("python-dir", { id: "py-id", type: "python" })
    await mkdir(join(scratch, "plugins", "no-manifest"))
    assert.deepEqual(frontendPlugins(scratch), ["a-dir", "b-dir"])
    assert.deepEqual(frontendPlugins(scratch, ["b-id", "a-dir"]), ["a-dir", "b-dir"])
    assert.throws(() => frontendPlugins(scratch, ["a-id", "py-id"]), /Unknown frontend plugins: py-id/)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
})

test("builds a plugin against the pinned kit and indexes the archive", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "cognia-plugins-build-"))
  try {
    const [entry] = await buildAll({ root, requested: ["cognia-goal-insights"], outDir })
    assert.equal(entry.id, "cognia-goal-insights")
    assert.ok(entry.files > 0)
    const archive = await readFile(join(root, entry.archive))
    assert.equal(createHash("sha256").update(archive).digest("hex"), entry.sha256)
    const pin = JSON.parse(await readFile(join(root, "authoring-kit.lock.json"), "utf8"))
    const index = JSON.parse(await readFile(join(outDir, "frontend-packages.json"), "utf8"))
    assert.deepEqual(index, { kitSha256: pin.sha256, packages: [entry] })
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
})
