# AGENTS.md

Rules for coding agents in this repository. Read `README.md` first.

## Plugin sources are maintained in cognia-labs/cognia

The main Cognia repository (the Host) is the source of truth for plugin code; this
repository imports it. Until that changes:

1. **Never edit an imported file here**: anything under `plugins/` or `scripts/plugin/`,
   or any path listed in `host-sync-paths.txt`. Make the change in the Host and import it
   with `scripts/sync-from-host.sh <host checkout> [ref]`. An edit here would make the next
   import conflict and the produced set differ from the Host's.
2. **An environment difference belongs in this repository's own files** (`jest.config.cjs`,
   the Jest setup files, `scripts/*.mjs`, `package.json`), never in a plugin.
3. **A test that needs the Host** goes in `host-integration-tests.json` with the reason
   covered by its `$comment`. The list may only shrink. Do not add a test there to hide a
   failure the Host shares; report it instead.
4. **Do not touch `scripts/build/`.** It holds the kit's tooling, written by
   `node scripts/bootstrap.mjs`.

## Changing the kit pin

The kit is generated from a Host commit (`node scripts/plugin/authoring-kit.mjs` in the
Host) and published on the `authoring-kits` branch under its manifest's SHA-256. Update
`authoring-kit.lock.json` to a commit-pinned raw URL of that manifest, then rerun
`node scripts/bootstrap.mjs`, `pnpm install` and every check below.

## Checks before a commit

```bash
pnpm typecheck && pnpm test && pnpm test:node && pnpm test:python && pnpm build && pnpm produce
```

Commit messages follow Conventional Commits. Never `--no-verify`.
