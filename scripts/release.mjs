#!/usr/bin/env node
// Package and check a plugin artifact set for a GitHub Release. Node built-ins
// only, so the archive bytes depend on the set alone, not on the platform's
// tar or gzip.
//
//   node scripts/release.mjs compare <set A> <set B>
//   node scripts/release.mjs pack --set <set dir> --tag <tag> --out <dir>
//   node scripts/release.mjs notes <release.json>
//
// `compare` fails unless both sets hold the same files with the same bytes and
// executable bits, the set manifest included.
//
// `pack` writes `cognia-plugin-artifacts-<tag>.tar.gz`, a reproducible ustar
// archive under `plugin-artifacts/` (sorted entries, mtime 0, uid/gid 0, mode
// 0644 or 0755), with a `release.json` that ties the tag to the source
// revision, kit, profile and archive digest, and a `SHA256SUMS` over both.

import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"

export const SET_MANIFEST = "plugin-artifacts.json"
export const ARCHIVE_ROOT = "plugin-artifacts"
export const RELEASE_MANIFEST = "release.json"
export const TAG_PATTERN = /^v\d+\.\d+\.\d+$/

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")

/** Every regular file under `root`, sorted, with POSIX relative paths and exec bits. */
export function listSet(root) {
  const files = []
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) {
        const relative = path.relative(root, full).split(path.sep).join("/")
        files.push({ path: relative, executable: (fs.statSync(full).mode & 0o111) !== 0 })
      } else throw new Error(`Unsupported entry in artifact set: ${full}`)
    }
  }
  walk(root)
  return files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
}

/** Differences between two sets; empty arrays mean byte-for-byte identical. */
export function compareSets(left, right) {
  const a = new Map(listSet(left).map((file) => [file.path, file]))
  const b = new Map(listSet(right).map((file) => [file.path, file]))
  const differ = []
  for (const [relative, file] of a) {
    const other = b.get(relative)
    if (!other) continue
    if (file.executable !== other.executable) differ.push({ path: relative, reason: "mode" })
    else if (!fs.readFileSync(path.join(left, relative)).equals(fs.readFileSync(path.join(right, relative))))
      differ.push({ path: relative, reason: "bytes" })
  }
  return {
    onlyLeft: [...a.keys()].filter((relative) => !b.has(relative)),
    onlyRight: [...b.keys()].filter((relative) => !a.has(relative)),
    differ,
  }
}

function splitUstarPath(name) {
  const bytes = Buffer.byteLength(name)
  if (bytes <= 100) return { prefix: "", name }
  for (let index = name.indexOf("/"); index > 0; index = name.indexOf("/", index + 1)) {
    const prefix = name.slice(0, index)
    const rest = name.slice(index + 1)
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(rest) <= 100) return { prefix, name: rest }
  }
  throw new Error(`Path too long for a ustar archive: ${name}`)
}

function ustarHeader({ name, size, mode }) {
  const header = Buffer.alloc(512)
  const split = splitUstarPath(name)
  const field = (offset, length, value) => header.write(value, offset, length, "utf8")
  const octal = (offset, length, value) =>
    field(offset, length, value.toString(8).padStart(length - 1, "0") + "\0")
  field(0, 100, split.name)
  octal(100, 8, mode)
  octal(108, 8, 0)
  octal(116, 8, 0)
  octal(124, 12, size)
  octal(136, 12, 0)
  header.fill(0x20, 148, 156)
  field(156, 1, "0")
  field(257, 6, "ustar\0")
  field(263, 2, "00")
  field(345, 155, split.prefix)
  let checksum = 0
  for (const byte of header) checksum += byte
  field(148, 8, checksum.toString(8).padStart(6, "0") + "\0 ")
  return header
}

/** A reproducible gzip'd ustar archive of the set under `plugin-artifacts/`. */
export function archiveSet(setDir) {
  const chunks = []
  for (const file of listSet(setDir)) {
    const bytes = fs.readFileSync(path.join(setDir, file.path))
    chunks.push(
      ustarHeader({
        name: `${ARCHIVE_ROOT}/${file.path}`,
        size: bytes.length,
        mode: file.executable ? 0o755 : 0o644,
      }),
      bytes,
      Buffer.alloc((512 - (bytes.length % 512)) % 512)
    )
  }
  chunks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(chunks), { level: 9 })
}

/** Write the release assets for `tag` and return their descriptor. */
export function packRelease({ setDir, tag, outDir }) {
  if (!TAG_PATTERN.test(tag)) throw new Error(`Release tags look like v1.2.3, got ${tag}`)
  const manifestBytes = fs.readFileSync(path.join(setDir, SET_MANIFEST))
  const manifest = JSON.parse(manifestBytes)
  const listed = Object.keys(manifest.files).sort()
  const present = listSet(setDir)
    .map((file) => file.path)
    .filter((relative) => relative !== SET_MANIFEST)
  if (JSON.stringify(listed) !== JSON.stringify(present))
    throw new Error("The set's files do not match its manifest; produce it again")
  for (const relative of listed)
    if (sha256(fs.readFileSync(path.join(setDir, relative))) !== manifest.files[relative])
      throw new Error(`Digest mismatch in the set: ${relative}`)
  fs.mkdirSync(outDir, { recursive: true })
  const archiveName = `cognia-plugin-artifacts-${tag}.tar.gz`
  const archive = archiveSet(setDir)
  const release = {
    schema: 1,
    tag,
    source: manifest.source,
    authoring: manifest.authoring,
    profile: manifest.profile,
    toolchain: manifest.toolchain,
    set: {
      schema: manifest.schema,
      manifestSha256: sha256(manifestBytes),
      files: listed.length,
      plugins: manifest.inventory.length,
    },
    archive: { name: archiveName, root: ARCHIVE_ROOT, bytes: archive.length, sha256: sha256(archive) },
  }
  const releaseBytes = Buffer.from(JSON.stringify(release, null, 2) + "\n")
  fs.writeFileSync(path.join(outDir, archiveName), archive)
  fs.writeFileSync(path.join(outDir, RELEASE_MANIFEST), releaseBytes)
  fs.writeFileSync(
    path.join(outDir, "SHA256SUMS"),
    `${sha256(archive)}  ${archiveName}\n${sha256(releaseBytes)}  ${RELEASE_MANIFEST}\n`
  )
  return release
}

/** Markdown release notes for a release descriptor. */
export function releaseNotes(release) {
  return [
    `Plugin artifact set built from ${release.source.repository}@${release.source.revision}.`,
    "",
    "| | |",
    "| --- | --- |",
    `| Archive | \`${release.archive.name}\` |`,
    `| Archive SHA-256 | \`${release.archive.sha256}\` |`,
    `| Set manifest SHA-256 | \`${release.set.manifestSha256}\` |`,
    `| Files / plugins | ${release.set.files} / ${release.set.plugins} |`,
    `| Product profile | ${release.profile.name} \`${release.profile.sha256}\` |`,
    `| Plugin SDK / UI / contract | ${release.authoring.sdkVersion} / ${release.authoring.uiVersion} / ${release.authoring.contractVersion} |`,
    `| Node.js | ${release.toolchain.nodeVersion} |`,
    "",
    "Produced on Linux and macOS with byte-identical results. Verify the download with `sha256sum -c SHA256SUMS`.",
    "",
  ].join("\n")
}

function argument(argv, name) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2)
  if (command === "compare" && rest.length === 2) {
    const result = compareSets(path.resolve(rest[0]), path.resolve(rest[1]))
    const count = result.onlyLeft.length + result.onlyRight.length + result.differ.length
    if (count) {
      console.error(JSON.stringify(result, null, 2))
      console.error(`[release] the sets differ in ${count} file(s)`)
      process.exit(1)
    }
    console.log(`[release] identical: ${listSet(path.resolve(rest[0])).length} file(s)`)
  } else if (command === "pack" && argument(rest, "--set") && argument(rest, "--tag") && argument(rest, "--out")) {
    const release = packRelease({
      setDir: path.resolve(argument(rest, "--set")),
      tag: argument(rest, "--tag"),
      outDir: path.resolve(argument(rest, "--out")),
    })
    console.log(`[release] ${release.archive.name} ${release.archive.sha256} (${release.set.files} files)`)
  } else if (command === "notes" && rest.length === 1) {
    process.stdout.write(releaseNotes(JSON.parse(fs.readFileSync(path.resolve(rest[0]), "utf8"))))
  } else {
    console.error(
      "usage: release.mjs compare <set A> <set B>\n       release.mjs pack --set <dir> --tag <vX.Y.Z> --out <dir>\n       release.mjs notes <release.json>"
    )
    process.exit(2)
  }
}
