# Uncached CLI MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publishable-test a free Node.js CLI that scans a workspace for valid `node_modules` directories and moves all confirmed targets to the system Trash.

**Architecture:** Keep CLI code in a standalone ESM package. `scan.mjs` owns traversal, contextual validation, and byte measurement; `trash.mjs` owns the platform Trash adapter; `cli.mjs` owns argument parsing, terminal output, one confirmation, and exit status. Use Node built-ins for scanning and testing, plus one small cross-platform Trash dependency.

**Tech Stack:** Node.js `>=22`, npm, ESM, `node:test`, `node:fs/promises`, `node:path`, `node:readline/promises`, Trash library.

## Global Constraints

- Repository is independent: `uncached-cli`.
- Package name is `uncached-cli` and executable name is `uncached`.
- Main command is `npx uncached scan [workspace]`.
- Workspace defaults to current directory.
- Scanner detects only `node_modules` directories whose parent contains `package.json`.
- Scanner ignores nested `node_modules`, symbolic links, and paths outside selected workspace.
- Cleanup moves every confirmed target to system Trash; it must never permanently delete.
- One confirmation applies to all targets; any response other than lowercase `y` cancels.
- CLI never modifies `package.json`, lockfiles, or non-target files.
- Individual Trash failures are reported and do not stop remaining targets.
- Human terminal output only; no JSON, config, filters, or individual selection in MVP.
- `files` in `package.json` must exclude tests, docs, and local artifacts from published tarball.

---

### Task 1: Package Scaffold

**Files:**
- Create: `package.json`
- Modify: `README.md`
- Create: `.gitignore`

**Interfaces:**
- Produces package metadata consumed by all later tasks.
- `npm test` runs the Node test runner with native test-file discovery.
- `bin.uncached` points to `src/cli.mjs`.

- [ ] **Step 1: Write package metadata**

Create `package.json` with ESM, Node engine, CLI bin, `files: ["src/"]`, test script, and the selected Trash dependency. Keep runtime dependencies limited to the Trash adapter dependency.

- [ ] **Step 2: Add repository ignores**

Ignore `node_modules/`, `coverage/`, generated `.tgz` files, and OS/editor artifacts. Do not ignore source, tests, or package metadata.

- [ ] **Step 3: Document supported usage**

Replace starter README with install, `npx uncached scan`, workspace argument, confirmation behavior, Trash-only safety guarantee, Node requirement, and local test commands.

- [ ] **Step 4: Verify package metadata**

Run:

```bash
npm install
npm pkg get name bin engines files
npm test
```

Expected: metadata contains `uncached-cli`, `uncached`, `>=22`, and `src/`; test command completes without shell-glob expansion errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json README.md .gitignore
git commit -m "chore: scaffold uncached cli package"
```

### Task 2: Workspace Scanner

**Files:**
- Create: `src/scan.mjs`
- Create: `test/scan.test.mjs`

**Interfaces:**
- Produces `scanWorkspace(workspacePath)` returning `{ targets, totalBytes }`.
- Each target is `{ path, bytes }`.
- `scanWorkspace` rejects a missing or non-directory workspace.

- [ ] **Step 1: Write scanner tests**

Cover these cases with temporary directories: valid top-level `node_modules` with parent `package.json`; valid nested project; directory named `node_modules` without parent `package.json`; nested package under a detected `node_modules`; symbolic-link directory; byte total; missing workspace; and file passed as workspace.

Use `mkdtemp`, `mkdir`, `writeFile`, `symlink`, and `rm` from `node:fs/promises`. Assert returned paths are absolute and `totalBytes` equals sum of target bytes.

- [ ] **Step 2: Run scanner tests to verify failure**

Run:

```bash
node --test test/scan.test.mjs
```

Expected: FAIL because `src/scan.mjs` does not exist.

- [ ] **Step 3: Implement traversal**

Implement `scanWorkspace` with `readdir({ withFileTypes: true })` and `lstat`-based link checks. Resolve workspace first, reject non-directories, prune any directory once its name is `node_modules`, validate `package.json` in its parent, measure regular files recursively, and return deterministic path ordering.

- [ ] **Step 4: Run scanner tests to verify success**

Run:

```bash
node --test test/scan.test.mjs
```

Expected: all scanner tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scan.mjs test/scan.test.mjs
git commit -m "feat: scan node modules targets"
```

### Task 3: Trash Adapter

**Files:**
- Create: `src/trash.mjs`
- Create: `test/trash.test.mjs`

**Interfaces:**
- Produces `moveToTrash(targetPath)` returning a promise that resolves after the dependency moves the path to system Trash.
- Produces `createTrashMover(trashFn)` for deterministic adapter tests; `trashFn` receives exactly one target path.
- Errors from the dependency propagate unchanged to the CLI layer.

- [ ] **Step 1: Write adapter contract tests**

Test `createTrashMover` with an injected async fake, asserting that one exact target path is passed to the Trash operation and that rejection is propagated. Do not invoke the real system Trash in unit tests.

- [ ] **Step 2: Run adapter tests to verify failure**

Run:

```bash
node --test test/trash.test.mjs
```

Expected: FAIL because the adapter is not implemented.

- [ ] **Step 3: Implement the adapter**

Import the Trash dependency from ESM. Implement `createTrashMover(trashFn)` and build production `moveToTrash` from the dependency. Do not expose permanent-delete helpers or fallback to `rm`, `rmdir`, or filesystem deletion.

- [ ] **Step 4: Run adapter tests to verify success**

Run:

```bash
node --test test/trash.test.mjs
```

Expected: all adapter tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trash.mjs test/trash.test.mjs package.json package-lock.json
git commit -m "feat: add system trash adapter"
```

### Task 4: CLI Flow

**Files:**
- Create: `src/cli.mjs`
- Create: `test/cli.test.mjs`

**Interfaces:**
- `src/cli.mjs` is executable through the `uncached` bin entry.
- Supports only `scan` followed by zero or one workspace path.
- Uses `scanWorkspace`, `moveToTrash`, and one confirmation prompt.

- [ ] **Step 1: Write CLI tests**

Cover valid `scan` with default workspace, explicit workspace, empty scan, invalid subcommand, too many arguments, confirmation cancellation, lowercase `y` confirmation moving every target, and one failed move continuing to later targets. Assert human output includes target paths, sizes, total, and failure text.

- [ ] **Step 2: Run CLI tests to verify failure**

Run:

```bash
node --test test/cli.test.mjs
```

Expected: FAIL because `src/cli.mjs` does not exist.

- [ ] **Step 3: Implement argument and confirmation flow**

Parse `process.argv`, reject unsupported shapes with nonzero status, default workspace to `process.cwd()`, print deterministic scan results, return `0` for an empty scan or cancellation, and ask exactly one `[y/N]` question when targets exist. Only exact lowercase `y` proceeds.

- [ ] **Step 4: Implement cleanup error handling**

After confirmation, call `moveToTrash` once per target. Count successes and failures, continue after rejection, print each failure path, and exit `0` unless scan or argument parsing failed.

- [ ] **Step 5: Run complete test suite**

Run:

```bash
npm test
```

Expected: all scanner, adapter, and CLI tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cli.mjs test/cli.test.mjs
git commit -m "feat: add uncached scan command"
```

### Task 5: Package Verification and Release Preparation

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Create: `LICENSE`

**Interfaces:**
- Produces a publishable tarball containing only runtime package files.
- Produces documented commands for local tarball installation and npm dry-run publication.

- [ ] **Step 1: Verify tarball contents**

Run:

```bash
npm pack --dry-run
```

Expected: tarball includes `package.json`, `README.md`, `LICENSE`, and `src/`; excludes `test/`, `docs/`, `node_modules/`, and local artifacts.

- [ ] **Step 2: Test packed CLI in a temporary workspace**

Run `npm pack`, install generated tarball into a disposable directory, create two valid `node_modules` fixtures, execute the installed `uncached scan <workspace>`, answer `N`, and verify both targets remain. Do not test real cleanup against a user workspace.

- [ ] **Step 3: Validate npm dry-run**

Run:

```bash
npm publish --dry-run
```

Expected: npm accepts package metadata and reports the intended files without publishing.

- [ ] **Step 4: Document release commands**

Add README commands for `npm login`, version increment, `npm publish`, and post-publish `npx uncached scan`. State that real publication requires npm authentication and package-name availability.

- [ ] **Step 5: Commit release preparation**

```bash
git add package.json package-lock.json README.md LICENSE
git commit -m "chore: prepare npm release"
```

- [ ] **Step 6: Final verification**

Run:

```bash
npm test
npm pack --dry-run
npm publish --dry-run
git status --short
```

Expected: tests pass, dry runs succeed, and working tree is clean.
