import assert from "node:assert/strict"
import { existsSync, statSync } from "node:fs"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { test } from "node:test"
import { KIT_DIR, KIT_PIN, bootstrap, installKitTooling } from "./bootstrap.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

test("installs only the kit's tooling files, replacing a differing copy", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "cognia-plugins-tooling-"))
  try {
    const kitRoot = join(scratch, "kit")
    await mkdir(join(kitRoot, "tooling", "scripts", "build"), { recursive: true })
    await mkdir(join(kitRoot, "contract"), { recursive: true })
    await writeFile(join(kitRoot, "tooling", "scripts", "build", "a.mjs"), "export const a = 1\n")
    await writeFile(join(kitRoot, "tooling", "scripts", "build", "b.mjs"), "export const b = 2\n")
    await writeFile(join(kitRoot, "contract", "catalog.json"), "{}\n")
    const manifest = {
      files: {
        "tooling/scripts/build/a.mjs": {},
        "tooling/scripts/build/b.mjs": {},
        "contract/catalog.json": {},
      },
    }
    const repo = join(scratch, "repo")
    await mkdir(join(repo, "scripts", "build"), { recursive: true })
    await writeFile(join(repo, "scripts", "build", "a.mjs"), "export const a = 1\n")
    await writeFile(join(repo, "scripts", "build", "b.mjs"), "stale\n")
    assert.deepEqual(installKitTooling({ root: repo, kitRoot, manifest }), ["scripts/build/b.mjs"])
    assert.equal(await readFile(join(repo, "scripts", "build", "b.mjs"), "utf8"), "export const b = 2\n")
    assert.equal(statSync(join(repo, "scripts", "build", "b.mjs")).mode & 0o777, 0o644)
    assert.equal(existsSync(join(repo, "catalog.json")), false)
    assert.equal(existsSync(join(repo, "contract")), false)
    assert.deepEqual(installKitTooling({ root: repo, kitRoot, manifest }), [])
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
})

test("bootstraps the pinned kit and its tooling into a fresh checkout", async () => {
  // Serve this checkout's verified kit as the source, so the test needs no network.
  const pin = JSON.parse(await readFile(join(root, KIT_PIN), "utf8"))
  const scratch = await mkdtemp(join(tmpdir(), "cognia-plugins-bootstrap-"))
  try {
    const source = pathToFileURL(join(root, KIT_DIR, "authoring-kit.json")).href
    await writeFile(join(scratch, KIT_PIN), JSON.stringify({ ...pin, url: source }))
    const first = await bootstrap({ root: scratch })
    assert.equal(first.cached, false)
    assert.equal(first.kitSha256, pin.sha256)
    assert.ok(first.tooling.includes("scripts/build/plugin-artifact-contract.mjs"))
    for (const file of first.tooling)
      assert.deepEqual(await readFile(join(scratch, file)), await readFile(join(root, file)))
    const second = await bootstrap({ root: scratch })
    assert.deepEqual([second.cached, second.tooling], [true, []])
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
})
