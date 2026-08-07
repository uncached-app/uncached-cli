# Shared Task 5 Report

## Status

Implemented npm launcher migration at Rust CLI commit `dbe5375`.

## Package Mapping

The public package remains `uncached-cli` with `uncached` mapped to
`bin/uncached.mjs`. Launcher mapping is fixed and contains no runtime download
or fallback:

| Platform | Optional package |
| --- | --- |
| Windows x64 | `@uncached/cli-win32-x64` |
| macOS arm64 | `@uncached/cli-darwin-arm64` |
| macOS x64 | `@uncached/cli-darwin-x64` |
| Linux x64 | `@uncached/cli-linux-x64` |

Launcher forwards `process.argv.slice(2)` unchanged, inherits child stdio, and
returns the native child's exit code. Unsupported platform/architecture and
missing optional package paths produce actionable nonzero diagnostics.

Each platform package manifest declares matching `os` and `cpu` constraints,
exposes `bin/uncached` as its stable native executable path, and includes no
placeholder executable. Binary artifacts are intentionally deferred to Task 6
release CI.

## Removed Implementation

Deleted `src/cli.mjs`, `src/scan.mjs`, `src/trash.mjs`, and their JS tests,
including the old packed-runtime cleanup test. Root package no longer depends
on `trash`; production JavaScript only resolves a fixed platform package and
spawns its native executable.

## Verification

- TDD red: initial `npm test` failed because `bin/uncached.mjs` did not exist.
- TDD green: `npm test` passed with 4 tests and 0 failures.
- `npm pack --dry-run` passed. Contents: `LICENSE`, `README.md`,
  `bin/uncached.mjs`, `package.json`.
- `npm publish --dry-run` passed. No publication occurred; npm emitted the
  expected login warning for dry-run publication.
- Root lockfile now contains only launcher metadata and optional platform
  package entries; legacy `trash` dependency entries are gone.

## Tarball Scope

The root `files` allowlist includes only `bin/`. npm's automatic metadata files
remain included. Rust source, `target/`, tests, docs, old JS implementation,
`node_modules/`, and local tarballs are excluded from the root package.

## Concerns

- Native platform packages are manifests only until Task 6 stages and publishes
  compiled binaries. Runtime execution cannot be claimed from this checkout.
- Optional package names must be published at version `0.1.0` before the root
  package can execute on supported hosts.
- The launcher resolves the stable package path `bin/uncached`; release CI must
  preserve that path and executable permissions for Unix artifacts.

## Correction

Implementation commit is `3867c3b`, not `dbe5375`.
