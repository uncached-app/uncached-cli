# uncached-cli

`uncached-cli` is an npm launcher for the native Rust `uncached` scanner.
The public npm package contains launcher metadata only; source repositories are
private, while the free npm package may be public.

## Supported Platforms

- Windows x64
- macOS arm64
- macOS x64
- Linux x64

Platform-specific optional packages provide native binaries. Release CI builds
and publishes those binary artifacts. This repository does not commit
placeholder executables.

## Usage

Run without a global install:

```bash
npx uncached scan
npx uncached scan ./path/to/workspace
```

The launcher forwards all arguments to the packaged Rust executable. Runtime
scanning, validation, confirmation, and Trash behavior belong to Rust
`uncached-core` and the Rust CLI, not JavaScript.

## Local Development

```bash
npm install
npm test
```

Launcher tests inject fake platform binaries because release binaries are
produced by Task 6.

## Release

Preview package contents and publication metadata without publishing:

```bash
npm pack --dry-run
npm publish --dry-run
```

Tagged release publication runs in GitHub Actions only. Configure these secret
names in the repository without committing their values:

- `UNCACHED_CORE_DEPLOY_KEY`: read-only deploy key for private `natanvianasp/uncached`.
- `NPM_TOKEN`: npm automation token with publish permission.

Push a version tag matching package versions, such as `v0.1.0`. Pull requests
build, smoke-test, and preview packages but never publish. GitHub does not expose
`UNCACHED_CORE_DEPLOY_KEY` to fork pull requests, so fork PR workflows fail with
an actionable message; use a branch in this repository or a trusted maintainer-
triggered workflow for private-core CI. This limitation does not grant fork code
access to the deploy key or weaken release security.

Source repositories remain private. Release CI publishes the root launcher and
matching platform packages with their compiled Rust binaries.
