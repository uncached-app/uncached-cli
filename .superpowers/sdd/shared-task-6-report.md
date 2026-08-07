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

## Review Fixes

### Checksum verification

The workflow now computes SHA-256 for the release binary before staging, stores
that digest through `GITHUB_ENV`, stages the binary, computes SHA-256 again from
the staged package path, and fails when the values differ. It no longer writes a
checksum generated from the same file and compares that file to itself.

### Smoke fixture

The smoke test creates a disposable project with valid root and nested package
`package.json` files, a `node_modules` target, and an unrelated fixture file. It
runs the binary with exact lowercase `n` first and exact lowercase `y` second,
checks cancellation preserves the target, checks confirmed cleanup removes only
`node_modules`, confirms the unrelated file remains, and detects a new entry in
the platform system Trash location. Fixture creation is rooted in
`RUNNER_TEMP` and uses Node APIs plus platform-specific Trash roots for Windows,
macOS, and Linux.

### Staging path hardening

`stage-platform-package.mjs` now rejects symlink components in the package and
`bin` paths before directory creation or copy. It validates lexical containment,
rechecks components after directory creation, resolves real paths, and enforces
real containment before writing. Regression tests cover symlinked package and
`bin` directories and verify no outside file is created.

### Fork pull-request limitation

Workflow and README now state that GitHub does not expose the private
`UNCACHED_CORE_DEPLOY_KEY` to fork pull requests. Fork PR CI fails with an
actionable message and must be run from a repository branch or trusted
maintainer-triggered workflow. No secret access or release gate was weakened.

## Review Fix Verification

- `node --test test/stage-platform-package.test.mjs`: 5 passed.
- `npm test`: 9 passed.
- `cargo test`: 10 integration tests passed; no failures.
- `cargo fmt --check`: passed.
- `cargo clippy --all-targets -- -D warnings`: passed.
- `npm pack --dry-run`: passed for root and all four platform packages.
- `npm publish --dry-run --ignore-scripts`: passed; npm emitted its expected
  local authentication warning and did not publish.
- Workflow secret/permanent-delete audit: no secret values or permanent-delete
  commands found; only named secret references and actionable messages remain.
- `git diff --check`: passed.

## Remaining Concerns

- GitHub Actions runner execution was not available locally, so native Trash
  provider behavior and fork-event secret handling still require CI validation.
- Real release remains gated on repository configuration for named secrets and
  matching version tags; no package was published.

## Shared Task 6 Follow-up

- Fixed private core checkout authentication by passing
  `${{ secrets.UNCACHED_CORE_DEPLOY_KEY }}` explicitly as `ssh-key` to its
  `actions/checkout@v4` step. The existing read-only deploy-key presence check,
  fork pull-request rejection, `persist-credentials: false`, and SSH-agent
  setup remain unchanged.
- Added `test/release-workflow.test.mjs`, a static regression test that requires
  explicit checkout key wiring, preserves fork/missing-secret and tag-only
  gates, and rejects private-key/token-shaped literals in workflow source.
- Verification: `node --test test/release-workflow.test.mjs` failed before the
  workflow change and passed after it; `npm test` passed with 10 tests;
  `cargo test` passed with 10 integration tests; `cargo fmt --check` and
  `cargo clippy --all-targets -- -D warnings` passed; root and all four
  platform `npm pack --dry-run` previews passed; root
  `npm publish --dry-run --ignore-scripts` passed without publishing.
- Manual workflow audit found only named secret references and no secret values,
  private-key material, or credential-shaped literals. PR builds remain
  non-publishing; publication jobs remain limited to pushed `v*.*.*` tags and
  still require `NPM_TOKEN`.
