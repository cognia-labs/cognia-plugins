import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { archiveSet, compareSets, listSet, packRelease } from "./release.mjs"

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")
const LONG = `builtin-plugins/${"a".repeat(40)}/${"b".repeat(64)}.cjs`

function makeSet(t, extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cognia-release-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const files = { "b.txt": "b", "a/run.sh": "#!/bin/sh\n", [LONG]: "chunk", ...extra }
  for (const [relative, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true })
    fs.writeFileSync(path.join(root, relative), text)
  }
  fs.chmodSync(path.join(root, "a/run.sh"), 0o755)
  const manifest = {
    schema: 2,
    source: { repository: "test/plugins", revision: "1".repeat(40) },
    authoring: { sdkVersion: "0.0.0" },
    profile: { name: "first-party", sha256: "2".repeat(64) },
    toolchain: { nodeVersion: "26.0.0" },
    inventory: [{ id: "tiny" }],
    files: Object.fromEntries(Object.keys(files).map((relative) => [relative, sha256(files[relative])])),
  }
  fs.writeFileSync(path.join(root, "plugin-artifacts.json"), JSON.stringify(manifest))
  return root
}

test("lists files sorted with their executable bit", (t) => {
  const root = makeSet(t)
  assert.deepEqual(listSet(root), [
    { path: "a/run.sh", executable: true },
    { path: "b.txt", executable: false },
    { path: LONG, executable: false },
    { path: "plugin-artifacts.json", executable: false },
  ])
})

test("compare reports missing files, changed bytes and changed modes", (t) => {
  const left = makeSet(t)
  const right = makeSet(t, { "extra.txt": "x" })
  assert.deepEqual(compareSets(left, left), { onlyLeft: [], onlyRight: [], differ: [] })
  fs.writeFileSync(path.join(right, "b.txt"), "B")
  fs.chmodSync(path.join(right, "a/run.sh"), 0o644)
  const result = compareSets(left, right)
  assert.deepEqual(result.onlyRight, ["extra.txt"])
  assert.deepEqual(
    result.differ.map((entry) => `${entry.path}:${entry.reason}`).sort(),
    ["a/run.sh:mode", "b.txt:bytes", "plugin-artifacts.json:bytes"]
  )
})

test("the archive is reproducible and extracts back to the same set with system tar", (t) => {
  const root = makeSet(t)
  const archive = archiveSet(root)
  assert.ok(archiveSet(root).equals(archive))
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cognia-release-out-"))
  t.after(() => fs.rmSync(out, { recursive: true, force: true }))
  fs.writeFileSync(path.join(out, "set.tar.gz"), archive)
  execFileSync("tar", ["-xzf", path.join(out, "set.tar.gz"), "-C", out])
  assert.deepEqual(compareSets(root, path.join(out, "plugin-artifacts")), {
    onlyLeft: [],
    onlyRight: [],
    differ: [],
  })
  const listing = execFileSync("tar", ["-tvzf", path.join(out, "set.tar.gz")], { encoding: "utf8" })
  assert.match(listing, /rwxr-xr-x.*plugin-artifacts\/a\/run\.sh/)
})

test("pack writes the archive, a release descriptor and their checksums", (t) => {
  const root = makeSet(t)
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cognia-release-pack-"))
  t.after(() => fs.rmSync(out, { recursive: true, force: true }))
  const release = packRelease({ setDir: root, tag: "v1.2.3", outDir: out })
  const archive = fs.readFileSync(path.join(out, "cognia-plugin-artifacts-v1.2.3.tar.gz"))
  const descriptor = fs.readFileSync(path.join(out, "release.json"))
  assert.deepEqual(JSON.parse(descriptor), release)
  assert.equal(release.archive.sha256, sha256(archive))
  assert.equal(release.set.manifestSha256, sha256(fs.readFileSync(path.join(root, "plugin-artifacts.json"))))
  assert.deepEqual([release.set.files, release.set.plugins], [3, 1])
  assert.equal(release.source.revision, "1".repeat(40))
  assert.equal(
    fs.readFileSync(path.join(out, "SHA256SUMS"), "utf8"),
    `${sha256(archive)}  cognia-plugin-artifacts-v1.2.3.tar.gz\n${sha256(descriptor)}  release.json\n`
  )
})

test("pack refuses a malformed tag, an unlisted file and a digest mismatch", (t) => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cognia-release-refuse-"))
  t.after(() => fs.rmSync(out, { recursive: true, force: true }))
  assert.throws(() => packRelease({ setDir: makeSet(t), tag: "latest", outDir: out }), /v1\.2\.3/)
  const unlisted = makeSet(t)
  fs.writeFileSync(path.join(unlisted, "stray.txt"), "x")
  assert.throws(() => packRelease({ setDir: unlisted, tag: "v1.0.0", outDir: out }), /do not match/)
  const tampered = makeSet(t)
  fs.writeFileSync(path.join(tampered, "b.txt"), "tampered")
  assert.throws(() => packRelease({ setDir: tampered, tag: "v1.0.0", outDir: out }), /Digest mismatch.*b\.txt/)
})
