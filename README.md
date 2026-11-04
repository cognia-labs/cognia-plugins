# cognia-plugins

The first-party plugins of [Cognia](https://github.com/cognia-labs/cognia): their
sources, the packager that turns them into standalone install ZIPs, and the producer that
turns them into the plugin artifact set the Cognia app ships.

> **Status: mirror (extraction plan P2).** The Cognia Host's `plugins/` directory is still
> the source of truth. This repository imports its history with
> `scripts/sync-from-host.sh` and proves that the plugins build, test and produce an
> identical artifact set without a Host checkout. Plugin changes still land in the Host
> until phase P4 of the extraction plan
> (`docs/plans/2026-10-30-plugins-repository-extraction.md` in the Host repository).

## How it fits together

- **Authoring kit.** Everything this repository needs from the Host comes in one pinned,
  content-addressed kit: the `@cognia/plugin-sdk`, `@cognia/plugin-ui` and
  `@cognia/github-bot-kit` packages, the Python SDK wheel, the plugin contract
  (`contract/*.json`, `cognia-plugin.wit`), the product profile that says which plugins
  ship, and the Host's artifact-format modules (`tooling/`). The kit is published on the
  `authoring-kits` branch of this repository; `authoring-kit.lock.json` pins its
  manifest by URL and SHA-256, and every file is verified on download.
- **Standalone ZIPs.** `pnpm build` packages each frontend plugin against the kit's
  contract, style and compiler semantics into `packages-out/`, and fails if a build reads
  anything outside this repository.
- **Artifact set.** `pnpm produce` writes the schema-2 artifact set to `artifact/`: the
  browser built-in chunks and their index, plugin icons and the installer-staged desktop
  plugins. The Host stages a set like this and never reads plugin source; its images take
  one as the `plugin-artifacts` build context.

## Getting started

Node 26, pnpm 11 (Corepack) and, for the Python plugins, [uv](https://docs.astral.sh/uv/).

```bash
node scripts/bootstrap.mjs   # download and verify the pinned kit into .vendor/
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test                    # Jest: plugin TypeScript/React suites
pnpm test:node               # node --test: script tests and node:test plugin suites
pnpm test:python             # pytest: repowiki and cognia-laya-guard, on the kit's SDK wheel
pnpm build                   # standalone ZIPs → packages-out/
pnpm produce                 # artifact set → artifact/
```

`pnpm bootstrap` has to run before `pnpm install`: the kit packages are `file:`
dependencies inside `.vendor/authoring-kit/`.

## Layout

| Path                            | Owner                                                                 |
| ------------------------------- | --------------------------------------------------------------------- |
| `plugins/`                      | Imported from the Host. Never edited here before P4.                  |
| `scripts/plugin/**`             | Imported from the Host (packager and producer). Never edited here.    |
| `scripts/build/`                | Kit tooling copies written by `bootstrap`. Git-ignored.               |
| `scripts/*.mjs`, root config    | This repository: bootstrap, build, test runners, sync.                |
| `host-integration-tests.json`   | Tests that need the Host and stay Host-owned. The list may only shrink. |
| `authoring-kit.lock.json`       | The kit pin.                                                          |
| `host-sync.json`, `host-sync-paths.txt` | Import state and the filtered path list.                      |

## Tests that stay in the Host

Some plugin tests import Host modules, read Host files or need a Host runtime port. They
are listed in `host-integration-tests.json` and run only in the Host; both test runners here
skip exactly that list. A known failure that also fails in the Host is not hidden:
`plugins/cognia-documents/src/docx.test.ts` ("does not report reconstructed layout…")
fails the same way in both repositories.

## License

AGPL-3.0-only, the same as the Cognia Host. See `LICENSE`.
