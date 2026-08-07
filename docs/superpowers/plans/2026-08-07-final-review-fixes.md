# Final Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans (inline execution).

**Goal:** Replace serial core traversal with bounded parallel `jwalk` traversal and harden packed CLI smoke coverage without weakening private-core or publish gates.

**Architecture:** `uncached-core` will use bounded Rayon-backed `jwalk` collection with symlink/protected-directory pruning, deterministic sorting, and callback replay with cancellation checks. CLI CI will install packed root and platform packages, run installed `npx --no-install uncached scan` with `N` and lowercase `y`, and verify system Trash plus fixture preservation.

**Tech Stack:** Rust 2021, `jwalk 0.8`, Cargo Git dependency, GitHub Actions, Node.js test runner, npm pack/publish dry-runs.

## Global Constraints

- Never publish `uncached-core` to crates.io.
- Keep CLI `uncached-core` dependency on private SSH Git repository pinned by immutable commit.
- Authenticate private core fetches in CI only through `UNCACHED_CORE_DEPLOY_KEY` deploy key.
- Preserve safety, checksum, secret, platform, and publish gates.
- Keep target sizing sequential unless behavior changes; document this explicitly.

### Task 1: Parallel Core Traversal

**Files:** `src-tauri/crates/uncached-core/src/scanner.rs`, focused core integration tests, scanner documentation.

- [ ] Add or adjust tests for deterministic sorted callbacks, subtree pruning, protected directories, symlink rejection, and cancellation.
- [ ] Replace recursive `read_dir` traversal with bounded `jwalk` traversal using `follow_links(false)` and worker cap `available_parallelism().clamp(1, 8)`.
- [ ] Collect entries, sort by canonical path, replay callbacks in sorted order, and stop on callback cancellation or atomic cancellation.
- [ ] Preserve matched-target pruning by excluding descendants of matched directories before callback replay.
- [ ] Document sequential target sizing and add representative bounded traversal/performance regression note.
- [ ] Run core tests, fmt, and clippy; commit core changes in `uncached`.

### Task 2: Release Smoke and Dependency Gates

**Files:** `.github/workflows/release.yml`, `test/release-workflow.test.mjs`, Cargo manifests only if audit finds drift.

- [ ] Extend packed-install smoke fixture with unrelated file and system Trash baseline.
- [ ] Run installed `npx --no-install uncached scan <fixture>` with `N`, verify target remains.
- [ ] Run same installed launcher with lowercase `y`, verify target moves to system Trash and unrelated file remains.
- [ ] Add static assertions for lowercase `y`, Trash verification, disposable paths, SSH Git pin, deploy-key authentication, and absence of crates.io publication for core.
- [ ] Run CLI Rust/npm tests, pack and publish dry-runs, workflow static audit; commit CLI changes.

### Task 3: Final Report

**File:** `.superpowers/sdd/final-fix-report.md` in `uncached-cli`.

- [ ] Append exact commands, results, commits, safety/publish audit, and residual concerns.
- [ ] Verify both repositories have only intended changes and report path is correct.
