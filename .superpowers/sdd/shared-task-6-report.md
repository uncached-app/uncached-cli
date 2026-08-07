# Shared Task 6 Report

## Status

Implemented multiplatform binary CI and tag-gated npm release flow. No real
package was published and no secret value was added to the repository.

## Release Matrix

| Runner | Rust target | npm package |
| --- | --- | --- |
| `windows-latest` | `x86_64-pc-windows-msvc` | `@uncached/cli-win32-x64` |
| `macos-latest` | `x86_64-apple-darwin` | `@uncached/cli-darwin-x64` |
| `macos-latest` | `aarch64-apple-darwin` | `@uncached/cli-darwin-arm64` |
| `ubuntu-latest` | `x86_64-unknown-linux-gnu` | `@uncached/cli-linux-x64` |

Each matrix job checks out CLI source, reads the pinned `uncached-core` revision
from `Cargo.toml`, checks out that private revision, runs Rust test/format/
clippy checks, builds the release binary, verifies SHA-256, stages the binary,
smoke-tests a disposable fixture, and previews package contents.

## Changes

- Added `scripts/stage-platform-package.mjs`.
- Added staging tests for target validation, missing input, binary naming,
  Unix mode `0755`, SHA-256 output, and package-directory isolation.
- Added `.github/workflows/release.yml` with the four-platform build matrix.
- Added private core checkout through an SSH deploy key loaded by Actions.
- Added disposable `N` and confirmed `y` smoke-test executions. Workflow uses
  the Rust Trash-backed cleanup path and contains no permanent-delete command.
- Added platform package publication jobs followed by root launcher publication.
- Preserved root launcher and optional dependency package mappings.
- Updated README release instructions to describe tag-only CI publication.

## Secrets Expected By Name

- `UNCACHED_CORE_DEPLOY_KEY`: read-only GitHub deploy key for private
  `natanvianasp/uncached`.
- `NPM_TOKEN`: npm publish token used only by tag-triggered publication jobs.

Workflow checks both secrets for presence and emits actionable missing-secret
messages. Values are not echoed, written to files, included in package paths,
or placed in Cargo metadata, URLs, lockfiles, or generated artifacts.

## Local Verification

- `npm test`: 7 passed.
- `cargo test`: passed, including 10 CLI integration tests.
- `cargo fmt --check`: passed.
- `cargo clippy --all-targets -- -D warnings`: passed.
- `npm pack --dry-run`: passed for root and all four platform packages.
- `npm publish --dry-run --ignore-scripts`: passed. npm emitted its expected
  local authentication warning; no publication occurred.
- Optional dependency/package manifest mapping audit: passed.
- Workflow static audit: passed; no credential material or permanent-delete
  command found.
- `git diff --check`: passed.

## Release Limitations

- GitHub Actions execution was not triggered locally, so runner-specific
  checkout, cross-target linker, Trash-provider, and npm registry behavior
  still require a real tag/PR CI run.
- Real release requires repository configuration for both named secrets and a
  version tag matching all package versions, for example `v0.1.0`.
- Local platform package previews contain manifests only because release
  binaries are intentionally not committed or generated for publication here.
