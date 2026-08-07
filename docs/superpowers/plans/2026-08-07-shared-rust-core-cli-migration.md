# Shared Rust Core and Multiplatform CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Uncached filesystem logic into a Rust core consumed by both desktop and a multiplatform CLI distributed through npm.

**Architecture:** `uncached-core` becomes a Tauri-independent crate in the desktop repository. The desktop keeps Tauri commands, events, session registry, settings, and UI adapters; it delegates shared node_modules scanning and Trash cleanup to the core. The CLI repository builds a Rust binary against the tagged core and publishes a thin npm launcher with platform-specific optional packages.

**Tech Stack:** Rust 2021, Cargo workspace, Tauri 2, `jwalk`, `trash`, `thiserror`, Node.js `>=22`, npm ESM launcher, GitHub Actions.

## Global Constraints

- Todos os repositórios permanecem privados durante desenvolvimento e lançamento inicial.
- O MVP gratuito suporta Windows, macOS e Linux e habilita somente o scanner `node_modules`.
- O core não dependerá de Tauri, React, npm, rede ou serviços de pagamento.
- `uncached-core` concentra traits, NodeModulesScanner, traversal, sizing, canonicalização, segurança de paths, TrashCleaner, erros e relatórios.
- Orquestração Tauri, eventos IPC, registro de sessões e estado visual permanecem no desktop adapter.
- Core não conhece preço, conta, token, licença ou entitlement.
- Composição será feita em compile-time no MVP.
- O launcher seleciona binário por `process.platform` e `process.arch`, repassa argumentos e propaga o exit code.
- Não haverá scanner ou limpeza implementados em JavaScript.
- O CLI nunca usa `rm -rf`, não altera `package.json` ou lockfiles e revalida targets imediatamente antes da Trash.
- Windows suporta `x64` inicialmente; macOS suporta `x64` e `arm64`; Linux suporta `x64`.
- Pacote npm gratuito pode ser público para permitir `npx uncached`, sem expor código-fonte dos repositórios privados.

---

### Task 1: Convert Desktop Rust Project to Workspace

**Repository:** `E:\projetos-pessoais\uncached`

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/crates/uncached-core/Cargo.toml`
- Create: `src-tauri/crates/uncached-core/src/lib.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces package `uncached-core` with no Tauri dependency.
- Desktop package `uncached` remains buildable and keeps existing crate name.

- [ ] **Step 1: Add a Cargo workspace test fixture**

Add workspace metadata while preserving the existing desktop package:

```toml
[workspace]
members = [".", "crates/uncached-core"]
resolver = "2"
```

Run `cargo metadata --manifest-path src-tauri/Cargo.toml --no-deps` and expect both packages to be listed.

- [ ] **Step 2: Create core crate metadata**

Create `src-tauri/crates/uncached-core/Cargo.toml` with package name `uncached-core`, edition `2021`, and only dependencies needed by extracted shared code: `jwalk`, `trash`, `thiserror`, `serde` with `derive`, and `serde_json` if reports require it. Do not add `tauri`.

- [ ] **Step 3: Create core module boundary**

Create `src-tauri/crates/uncached-core/src/lib.rs` exporting `error`, `model`, `scanner`, `filesystem`, and `cleaner` modules. Keep the module public API intentionally small; desktop-specific modules remain under `src-tauri/src` until later tasks.

- [ ] **Step 4: Verify workspace compilation**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml --workspace
```

Expected: both the empty core crate and existing desktop crate compile.

- [ ] **Step 5: Commit in desktop repository**

```bash
git add src-tauri/Cargo.toml src-tauri/crates/uncached-core src-tauri/src/lib.rs
git commit -m "build: add shared uncached core crate"
```

### Task 2: Extract Shared NodeModules Core

**Repository:** `E:\projetos-pessoais\uncached`

**Files:**
- Create/modify: `src-tauri/crates/uncached-core/src/error.rs`
- Create/modify: `src-tauri/crates/uncached-core/src/model.rs`
- Create/modify: `src-tauri/crates/uncached-core/src/scanner.rs`
- Create/modify: `src-tauri/crates/uncached-core/src/filesystem.rs`
- Create/modify: `src-tauri/crates/uncached-core/src/cleaner.rs`
- Create: `src-tauri/crates/uncached-core/tests/node_modules.rs`
- Modify: `src-tauri/Cargo.toml`

**Interfaces:**
- `scan_workspace(root: &Path, providers: &ProviderSet) -> CoreResult<ScanReport>`.
- `ProviderSet::free() -> ProviderSet` registers only `NodeModulesScanner`.
- `clean_to_trash(root: &Path, target: &ScanTarget) -> CoreResult<CleanReport>` revalidates target before moving it.
- `ScanTarget` contains absolute path, category, and measured byte count.

- [ ] **Step 1: Port scanner safety tests before implementation**

Move or recreate tests for valid project `node_modules`, nested dependency pruning, missing parent `package.json`, Visual Studio/NVM exclusions, symlink rejection, root containment, and deterministic ordering. Use temporary directories and assert no target outside the workspace is returned.

- [ ] **Step 2: Run core tests to verify red state**

Run `cargo test -p uncached-core`. Expected: tests fail because shared APIs are not implemented.

- [ ] **Step 3: Extract models and errors**

Move category, target, clean report, and filesystem error types into core. Remove Tauri serialization/event concerns from these types; derive `Debug`, `Clone`, and `Serialize` only where the type is part of the public report contract.

- [ ] **Step 4: Extract traversal and sizing**

Port `DiskWalker` and directory sizing to core. Preserve subtree pruning, hidden-directory traversal, protected Windows directories, symlink rejection, and deterministic child ordering.

- [ ] **Step 5: Extract NodeModulesScanner and provider registration**

Port `NodeModulesScanner` with its current context rules. `ProviderSet::free()` must register no scanner besides `NodeModulesScanner`; scanner registration must be explicit rather than global mutable state.

- [ ] **Step 6: Extract defensive Trash cleanup**

Port `TrashCleaner` behind `clean_to_trash`. Before calling `trash::delete`, revalidate canonical workspace, target ancestry, target name, parent `package.json`, real-directory status, containment, and safe-delete rules. No permanent cleaner belongs in free core path.

- [ ] **Step 7: Run core tests to verify green state**

Run:

```bash
cargo test -p uncached-core
cargo clippy -p uncached-core --all-targets -- -D warnings
```

Expected: all core tests pass with no warnings.

- [ ] **Step 8: Commit shared core**

```bash
git add src-tauri/Cargo.toml src-tauri/crates/uncached-core
git commit -m "feat: extract node modules core"
```

### Task 3: Adapt Desktop to Shared Core

**Repository:** `E:\projetos-pessoais\uncached`

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/services/scan_service.rs`
- Modify: `src-tauri/src/services/clean_service.rs`
- Modify: `src-tauri/src/scanner/mod.rs`
- Modify: `src-tauri/src/scanner/node_modules.rs`
- Modify: `src-tauri/src/cleaner/trash.rs`
- Modify: `src-tauri/src/filesystem/mod.rs`

**Interfaces:**
- Desktop scan events and session registry keep their current IPC contracts.
- Desktop uses `uncached_core::ProviderSet::free()` for the free node_modules path.
- Existing non-node scanners remain desktop-only until explicitly migrated.

- [ ] **Step 1: Add local core dependency and adapter tests**

Add `uncached-core` as a path dependency. Add tests proving desktop command serialization still emits current event payloads and that the free provider set finds the same node_modules targets as before.

- [ ] **Step 2: Delegate node_modules scan to core**

Update `ScanService` so its worker invokes core scanning/provider logic for node_modules while retaining scan IDs, target registry, asynchronous sizing events, cancellation, settings, and existing desktop-only scanner behavior.

- [ ] **Step 3: Delegate Trash cleanup to core safety path**

Update `CleanService`/`TrashCleaner` to call shared target validation and Trash operation. Preserve permanent deletion only behind existing desktop destructive mode and exact `Nuke` confirmation; never expose that mode to free CLI.

- [ ] **Step 4: Remove duplicate node_modules logic**

Delete or reduce desktop-local node_modules scanner, walker, path, and Trash implementations only after call sites use core. Do not remove desktop-only scanners or Tauri session orchestration.

- [ ] **Step 5: Verify desktop**

Run:

```bash
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

Run existing frontend tests/build if required by repository scripts. Expected: existing desktop behavior and IPC tests remain green.

- [ ] **Step 6: Commit desktop adapter migration**

```bash
git add src-tauri
git commit -m "refactor: use shared core in desktop"
```

### Task 4: Build Rust CLI in Separate Repository

**Repository:** `E:\projetos-pessoais\uncached-cli`

**Files:**
- Create: `Cargo.toml`
- Create: `src/main.rs`
- Create: `src/cli.rs`
- Create: `tests/cli.rs`
- Modify: `.gitignore`
- Remove after migration: `src/scan.mjs`, `src/trash.mjs`, `src/cli.mjs`, JS unit tests

**Interfaces:**
- Binary command: `uncached scan [workspace]`.
- Default workspace is current directory.
- `scan_workspace` uses `ProviderSet::free()` only.
- One exact lowercase `y` confirmation applies to all targets.
- Cancellation exits `0`; invalid arguments/scan failures exit nonzero; per-target Trash failures are reported while remaining targets continue.

- [ ] **Step 1: Add Rust CLI manifest against tagged core**

Create a binary crate with a Git dependency on the `uncached` repository, selecting package `uncached-core` at an explicit tag/revision. Add `clap` only if argument parsing needs it; otherwise use `std::env` to keep binary small. Add terminal prompt support with standard input/output.

- [ ] **Step 2: Write CLI integration tests**

Cover default/explicit workspace, empty scan, invalid command, one confirmation for all targets, cancellation preserving targets, lowercase-y cleanup, scan error exit status, symlink replacement rejection, and continuation after one Trash failure. Use disposable directories and injected core cleanup boundary where real Trash would make the test nondeterministic.

- [ ] **Step 3: Implement terminal adapter**

Parse only `scan` plus zero or one path, print target paths/bytes and total, prompt once, and map core reports/errors to stable human output and exit codes.

- [ ] **Step 4: Implement final target validation boundary**

Call core cleanup for every confirmed target. Core remains authoritative for canonicalization, target ancestry, symlink checks, workspace containment, and Trash-only behavior.

- [ ] **Step 5: Verify Rust CLI**

Run:

```bash
cargo fmt --all -- --check
cargo test
cargo clippy --all-targets -- -D warnings
cargo run -- scan --help
```

Expected: tests pass, no warnings, and unsupported flags are rejected unless explicitly implemented by the command contract.

- [ ] **Step 6: Commit Rust CLI**

```bash
git add Cargo.toml Cargo.lock src tests .gitignore
git commit -m "feat: add rust uncached cli"
```

### Task 5: Replace JS Package with npm Launcher

**Repository:** `E:\projetos-pessoais\uncached-cli`

**Files:**
- Modify: `package.json`
- Create: `bin/uncached.mjs`
- Create: `packages/cli-win32-x64/package.json`
- Create: `packages/cli-darwin-arm64/package.json`
- Create: `packages/cli-darwin-x64/package.json`
- Create: `packages/cli-linux-x64/package.json`
- Modify: `README.md`
- Remove: `src/scan.mjs`, `src/trash.mjs`, `src/cli.mjs`, JS tests

**Interfaces:**
- Public package remains `uncached-cli` with bin `uncached`.
- Launcher selects exactly one optional platform package using `process.platform` and `process.arch`.
- Launcher forwards all arguments and exits with child binary exit code.
- No scanner, path validation, or Trash operation exists in launcher code.

- [ ] **Step 1: Write launcher tests**

Test platform mapping, unsupported platform error, argument forwarding, child exit-code propagation, and missing platform package diagnostics. Use a fake binary path and injected process/platform boundary.

- [ ] **Step 2: Implement launcher**

Resolve package names from a fixed map, locate the packaged executable, spawn it with inherited stdio and `process.argv.slice(2)`, and return the child status. Never download code at runtime.

- [ ] **Step 3: Add platform package manifests**

Each platform package contains only its native executable under a stable `bin/` path and declares matching `os` and `cpu` metadata. Root package uses optional dependencies so npm installs only the matching package.

- [ ] **Step 4: Verify npm package locally**

Run `npm test`, `npm pack --dry-run`, install the tarball into disposable projects on the host platform, execute `npx uncached scan`, answer `N`, and verify no target changed. Assert tarball excludes Rust sources, tests, docs, `node_modules`, and local artifacts.

- [ ] **Step 5: Commit launcher migration**

```bash
git add package.json package-lock.json bin packages README.md src test
git commit -m "feat: distribute rust cli through npm"
```

### Task 6: Multiplatform Binary CI and Release

**Repositories:** `E:\projetos-pessoais\uncached`, `E:\projetos-pessoais\uncached-cli`

**Files:**
- Create/modify: `.github/workflows/release.yml` in both repositories as needed
- Create: `scripts/stage-platform-package.mjs`
- Modify: platform package manifests and README release instructions

**Interfaces:**
- Tagged core revision produces desktop and CLI builds from same Rust source.
- Release job stages binaries into four platform npm packages.
- npm package version and binary/core revision are recorded together.

- [ ] **Step 1: Define release matrix**

Build `windows-latest x86_64-pc-windows-msvc`, `macos-latest x86_64-apple-darwin`, `macos-latest aarch64-apple-darwin`, and `ubuntu-latest x86_64-unknown-linux-gnu`. Fail unsupported host/target combinations instead of publishing incomplete packages.

- [ ] **Step 2: Add artifact staging**

Copy each compiled binary into matching platform package `bin/uncached` or `bin/uncached.exe`, set executable mode on Unix, verify checksum, and run the binary scan smoke test before upload.

- [ ] **Step 3: Publish package set atomically**

Publish platform packages first with matching version, then root launcher. Use `npm publish --access public` only for the free launcher/packages if desired; keep source repositories private and Pro packages private.

- [ ] **Step 4: Verify release from clean install**

In a disposable environment, run `npx uncached scan <fixture>` on each matrix platform, answer `N`, then run a confirmed cleanup against a disposable target and verify it leaves the workspace without permanent-delete code paths.

- [ ] **Step 5: Commit CI and release docs**

```bash
git add .github scripts packages README.md
git commit -m "ci: build multiplatform cli packages"
```

### Task 7: Final Cross-Repository Review

**Files:**
- Verify only; modify files only for findings.

- [ ] **Step 1: Compare desktop and CLI core revisions**

Confirm desktop path dependency and CLI Git dependency resolve the same `uncached-core` commit/tag.

- [ ] **Step 2: Run final tests**

Run in desktop repository:

```bash
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

Run in CLI repository:

```bash
cargo fmt --all -- --check
cargo test
cargo clippy --all-targets -- -D warnings
npm test
npm pack --dry-run
npm publish --dry-run
git status --short
```

- [ ] **Step 3: Confirm no JS core remains**

Search the CLI repository for scanner, traversal, size, Trash, or path-safety implementation in JavaScript. Only launcher/platform selection may remain in JS.

- [ ] **Step 4: Confirm security invariants**

Verify both desktop and CLI use shared final validation, reject symlinks and outside-root targets, require contextual `package.json`, use system Trash only for free cleanup, and never accept frontend/terminal paths as post-scan authorization.
