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
