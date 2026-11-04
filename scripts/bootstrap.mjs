#!/usr/bin/env node
// Prepare the pinned authoring kit before `pnpm install`. Node built-ins only:
// nothing from node_modules exists yet.
//
//   node scripts/bootstrap.mjs
//
// 1. Download (or re-verify) the kit named by `authoring-kit.lock.json` into
//    `.vendor/authoring-kit/`; every file is checked against its SHA-256.
// 2. Install the kit's `tooling/` files (the Host-owned artifact contract and
//    format modules) at their repository paths. They are git-ignored copies of
//    the kit, never edited here, and a differing copy is replaced.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { bootstrapAuthoringKit, readAuthoringKit } from "./plugin/bootstrap-authoring-kit.mjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const KIT_PIN = "authoring-kit.lock.json"
export const KIT_DIR = path.join(".vendor", "authoring-kit")
const TOOLING = "tooling/"

/** Copy the kit's tooling files to the repository; returns the relative paths written. */
export function installKitTooling({ root, kitRoot, manifest }) {
  const written = []
  for (const relative of Object.keys(manifest.files)) {
    if (!relative.startsWith(TOOLING)) continue
    const destination = relative.slice(TOOLING.length)
    const target = path.join(root, destination)
    const bytes = fs.readFileSync(path.join(kitRoot, relative))
    if (fs.existsSync(target) && fs.readFileSync(target).equals(bytes)) continue
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, bytes)
    fs.chmodSync(target, 0o644)
    written.push(destination)
  }
  return written
}

export async function bootstrap({ root = ROOT, fetchImpl } = {}) {
  const pinFile = path.join(root, KIT_PIN)
  const kitRoot = path.join(root, KIT_DIR)
  const pin = JSON.parse(fs.readFileSync(pinFile, "utf8"))
  const { cached } = await bootstrapAuthoringKit({
    pinFile,
    target: kitRoot,
    ...(fetchImpl ? { fetchImpl } : {}),
  })
  const { manifest } = readAuthoringKit(kitRoot, pin.sha256)
  return { cached, kitSha256: pin.sha256, tooling: installKitTooling({ root, kitRoot, manifest }) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { cached, kitSha256, tooling } = await bootstrap()
  console.log(
    `[bootstrap] kit ${kitSha256.slice(0, 12)} ${cached ? "verified from cache" : "downloaded and verified"}` +
      (tooling.length ? `; tooling updated: ${tooling.join(", ")}` : "; tooling current")
  )
}
