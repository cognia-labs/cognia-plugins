#!/usr/bin/env node
// Build every frontend plugin into a standalone ZIP under `packages-out/`,
// against the pinned kit's contract, style and compiler semantics.
//
//   node scripts/build.mjs [plugin directory or id ...]
//
// Writes `packages-out/frontend-packages.json` listing each archive and its
// SHA-256. Fails if any build reads a file outside this repository.

import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildFrontendPlugin, writeFrontendPackage } from "./plugin/build-frontend-plugins.mjs"
import { readAuthoringKit } from "./plugin/bootstrap-authoring-kit.mjs"
import { KIT_DIR, KIT_PIN } from "./bootstrap.mjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/** Frontend plugin directories under `plugins/`, sorted, optionally filtered by directory or id. */
export function frontendPlugins(root, requested = []) {
  const unmatched = new Set(requested)
  const selected = []
  for (const directory of fs.readdirSync(path.join(root, "plugins")).sort()) {
    const file = path.join(root, "plugins", directory, "plugin.json")
    if (!fs.existsSync(file)) continue
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"))
    if (manifest.type !== "frontend") continue
    if (requested.length && !requested.includes(directory) && !requested.includes(manifest.id))
      continue
    unmatched.delete(directory)
    unmatched.delete(manifest.id)
    selected.push(directory)
  }
  if (unmatched.size) throw new Error(`Unknown frontend plugins: ${[...unmatched].join(", ")}`)
  return selected
}

export async function buildAll({ root = ROOT, requested = [], outDir } = {}) {
  const pin = JSON.parse(fs.readFileSync(path.join(root, KIT_PIN), "utf8"))
  const kit = readAuthoringKit(path.join(root, KIT_DIR), pin.sha256)
  outDir = path.resolve(outDir ?? path.join(root, "packages-out"))
  fs.mkdirSync(outDir, { recursive: true })
  const packages = []
  for (const directory of frontendPlugins(root, requested)) {
    const result = await buildFrontendPlugin({
      root,
      directory,
      contractCatalog: kit.contractCatalog,
      styleContract: kit.styleContract,
      compilerContract: kit.compilerContract,
    })
    for (const input of result.inputs)
      if (!path.resolve(input).startsWith(root + path.sep))
        throw new Error(`Build of ${directory} read outside the repository: ${input}`)
    const archive = await writeFrontendPackage(result, outDir)
    packages.push({
      directory,
      id: result.manifest.id,
      version: result.manifest.version,
      archive: path.relative(root, archive),
      sha256: createHash("sha256").update(fs.readFileSync(archive)).digest("hex"),
      files: result.files.size,
    })
  }
  fs.writeFileSync(
    path.join(outDir, "frontend-packages.json"),
    JSON.stringify({ kitSha256: pin.sha256, packages }, null, 2) + "\n"
  )
  return packages
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packages = await buildAll({ requested: process.argv.slice(2) })
  console.log(`[build] ${packages.length} frontend package(s) in packages-out/`)
}
