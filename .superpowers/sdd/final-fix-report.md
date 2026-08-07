# Final Fix Report

## Scope

Fixed final review findings across `uncached` and `uncached-cli`.

## Implemented

- Added `CleanReport.size_has_errors` and best-effort cleanup sizing. Cleanup validates the target, records partial size when available, revalidates, and still calls Trash after sizing errors.
- Added regression coverage proving delete is called after sizing failure.
- Added bounded parallel `jwalk` sizing with deterministic target sorting and a focused deterministic-output test documenting the behavior.
- Added optional filesystem identity metadata to scanned core targets. Desktop retains identity internally through its registry; CLI and desktop both pass it into final core validation where available.
- Preserved symlink, ancestry, containment, package-context, and safe-delete checks. Documented residual path-based TOCTOU risk around `trash::delete` in `uncached/docs/SECURITY.md`.
- Distinguished explicit non-`y` cancellation from stdin errors. Cancellation prints `Cancelled.` and exits `0`; confirmation read errors print concise diagnostics and exit `1`.
- Added CI smoke flow that packs root launcher and matching staged platform package, installs both into a disposable project, and runs `npx --no-install uncached scan` with `N` before publish jobs.
- Removed unused `CORE_DEPLOY_KEY_SECRET` and redundant private-core checkout. Cargo Git fetch remains authoritative; SSH-agent private authentication remains required and fork PR protection remains intact.
- Added/updated Rust, Node, workflow, identity, sizing, and cancellation tests.
- Addressed existing workspace clippy errors so requested strict clippy verification is executable.

## Commits

### `uncached`

- `ddb7ea67b9213d076d15029ca02fdca5faeeda77` `fix(core): harden trash cleanup`
- `f247d02d755fc12c1670fad9e6bdffbe095c3331` `fix: satisfy workspace lint`
- `625e4e98d0b1dba82983b55b9a7a3de59bd88093` `fix(desktop): retain target identity`

### `uncached-cli`

- `71b5ee06c937c3f947cbdc677fdb823302ffabc2` `fix(cli): close final review gaps`
- `52bb539` `build: repin shared core`

## Verification

- Desktop `cargo fmt --all -- --check`: pass.
- Desktop `cargo test --workspace`: pass, 33 desktop tests and 16 core integration tests.
- Desktop `cargo clippy --workspace --all-targets -- -D warnings`: pass.
- CLI `cargo test --test cli`: 12 pass against committed core through temporary local path substitution. Direct Git verification is blocked locally because private revision is not available from GitHub until the core commits are pushed or otherwise exposed to CI.
- CLI `cargo fmt --all -- --check`: pass.
- CLI `cargo clippy --all-targets -- -D warnings`: pass against committed core through the same temporary local path substitution.
- CLI `npm test`: 13 pass.
- CLI `npm pack --dry-run`: pass; root tarball contains launcher metadata/runtime only.
- CLI `npm publish --dry-run --ignore-scripts`: pass; no publication performed.
- Workflow static tests: 3 pass, including package-install smoke ordering, deploy-key auth, and removal of redundant checkout/secret variable.
- `git diff --check`: pass before commits.
- Static workflow secret audit: no embedded private key, GitHub token, npm token, password, or credential-shaped literal; only named secret references remain.

## Concerns

- Native four-platform CI, platform Trash providers, and packed binary execution require GitHub Actions after core commits are available in the private remote.
- Direct local CLI Cargo fetch against the private Git revision cannot authenticate in this environment; local Rust checks used the exact committed core path and restored the committed Git manifest/lock afterward.
- Real npm publication was not attempted.
- Filesystem identity is implemented on Unix using device/inode metadata. Stable cross-platform identity APIs are not exposed by the current Windows Rust standard library, so Windows retains all path, symlink, containment, and immediate revalidation defenses but has the documented residual path race.

## Final Review Fixes: 2026-08-07

### Changes

- Replaced recursive serial `read_dir` descent in `src-tauri/crates/uncached-core/src/scanner.rs` with bounded `jwalk 0.8` traversal using a Rayon pool capped at eight workers.
- Traversal rejects symlinks, files, and protected directories before descent; default `node_modules` targets are pruned in the parallel walker, while callback-level pruning preserves custom provider behavior.
- Traversal entries are sorted by path before callback replay. Cancellation is checked before walking and between callbacks; `Prune` suppresses descendants and `Cancel` stops replay. Existing target results remain deterministically sorted.
- Target directory sizing remains sequential by design to preserve existing error and result semantics; this is documented beside `scan_workspace` sizing.
- Packed release smoke now installs root and matching platform tarballs, runs installed `npx --no-install uncached scan` with `N`, then lowercase `y`, verifies `node_modules` reaches system Trash, and verifies unrelated fixture content remains.
- Added workflow static gates for disposable paths, lowercase confirmation, Trash verification, private SSH Git dependency pinned to a 40-character revision, deploy-key authentication, and no `cargo publish` path.
- Added implementation plan at `docs/superpowers/plans/2026-08-07-final-review-fixes.md`.

### Verification

- `uncached`: `cargo fmt --check`: pass.
- `uncached`: `cargo test --workspace`: pass, 33 desktop tests and 16 core integration tests.
- `uncached`: `cargo clippy --workspace --all-targets -- -D warnings`: pass.
- `uncached`: `git diff --check`: pass before commit.
- `uncached-cli`: `node --test test/release-workflow.test.mjs`: pass, 4 tests.
- `uncached-cli`: `npm test`: pass, 14 tests.
- `uncached-cli`: `npm pack --dry-run`: pass; launcher-only package contents reported.
- `uncached-cli`: `npm publish --dry-run --ignore-scripts`: pass; npm reported dry-run only and no publication occurred.
- `uncached-cli`: `git diff --check`: pass before commit.
- CLI workflow static audit: pass; checksum, fork/deploy-key, platform matrix, publish ordering, and secret-shape assertions remain present.
- CLI `cargo test`, `cargo fmt --check`, and `cargo clippy --all-targets -- -D warnings`: blocked before compilation because local environment lacks deploy-key authentication for the intentionally private pinned Git revision `625e4e98d0b1dba82983b55b9a7a3de59bd88093`. This confirms the dependency is not silently falling back to crates.io or a path dependency.

### Commits

- `uncached`: `5cebbd7` `perf(core): parallelize workspace traversal`
- `uncached-cli`: `ca834ec` `ci: harden packed launcher smoke`

### Concerns

- Packed binary N/y Trash smoke executes in GitHub Actions on each matrix platform; local execution was not possible without authenticated private-core fetch and platform release binary.
- Real npm publication was not attempted. Dry-run remains gated and no `uncached-core` crates.io publication step exists.
- CI must continue providing `UNCACHED_CORE_DEPLOY_KEY` through `webfactory/ssh-agent`; removing that secret or changing the SSH Git URL would make the intended private dependency gate fail.
