# cognia-plugins

First-party plugins for [Cognia](https://github.com/cognia-labs/cognia), together with the
tooling that packages each plugin as a standalone install archive and produces the plugin
artifact set that Cognia ships.

## Overview

- **Authoring kit.** Everything the plugins need from Cognia is delivered as one pinned,
  content-addressed authoring kit: the `@cognia/plugin-sdk`, `@cognia/plugin-ui` and
  `@cognia/github-bot-kit` packages, the Python SDK wheel, the plugin contract, the
  product profile that lists the bundled plugins, and the artifact-format modules. Kits are
  published on the `authoring-kits` branch. `authoring-kit.lock.json` pins one by URL and
  SHA-256, and every file is verified when it is downloaded.
- **Standalone packages.** `pnpm build` packages each frontend plugin against the kit's
  contract into `packages-out/`. A build that reads a file outside this repository fails.
- **Artifact set.** `pnpm produce` writes the plugin artifact set to `artifact/`: the
  browser built-in bundles and their index, the plugin icons and the desktop-bundled
  plugins. Cognia consumes this set at build time.

## Requirements

- Node.js 26 or later
- pnpm 11 (via Corepack)
- [uv](https://docs.astral.sh/uv/), for the Python plugin tests

## Getting started

```bash
node scripts/bootstrap.mjs
pnpm install --frozen-lockfile
```

`scripts/bootstrap.mjs` downloads and verifies the pinned authoring kit into
`.vendor/authoring-kit/`. It must run before `pnpm install`, because the kit packages are
installed from that directory.

## Commands

| Command            | Purpose                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| `pnpm typecheck`   | Type-check the plugin sources                                            |
| `pnpm test`        | Run the Jest suites                                                      |
| `pnpm test:node`   | Run the `node:test` suites (tooling and plugin build tests)              |
| `pnpm test:python` | Run the Python plugin tests against the kit's SDK wheel                  |
| `pnpm build`       | Build the standalone plugin packages into `packages-out/`                |
| `pnpm produce`     | Produce the plugin artifact set into `artifact/`                         |

## Releases

Pushing a version tag (`v1.2.3`) on a commit of `main` runs `.github/workflows/release.yml`:
the set is produced on Linux and macOS, both archives must be byte-for-byte identical, and the
release is published with three assets:

- `cognia-plugin-artifacts-<tag>.tar.gz`: the set under `plugin-artifacts/`, as a
  reproducible archive (`scripts/release.mjs pack`);
- `release.json`: the source revision, authoring kit identity, product profile, set manifest
  digest and archive digest;
- `SHA256SUMS`: checksums of both.

A tag that already has a release is refused, and published releases are immutable. A new
plugin build is always a new version.

## Repository layout

| Path                                    | Contents                                                       |
| --------------------------------------- | -------------------------------------------------------------- |
| `plugins/`                              | Plugin sources                                                 |
| `scripts/plugin/`                       | Plugin packager and artifact producer                          |
| `scripts/*.mjs`                         | Bootstrap, build, test and sync entry points                   |
| `scripts/build/`                        | Kit tooling installed by the bootstrap (not committed)         |
| `authoring-kit.lock.json`               | Authoring kit pin                                              |
| `host-integration-tests.json`           | Tests that run only in the main Cognia repository              |
| `host-sync.json`, `host-sync-paths.txt` | Synchronization state and the synchronized paths               |

## Development

Plugin sources are currently maintained in the main Cognia repository and synchronized
into this repository, with their history, by `scripts/sync-from-host.sh`. Contributions to
plugin code should be made there. Changes to this repository's own tooling and
configuration are made here.

Tests that depend on the main repository's modules or runtime are listed in
`host-integration-tests.json`; they run there and are skipped here.

## License

[AGPL-3.0-only](LICENSE)
