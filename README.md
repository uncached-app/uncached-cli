# uncached-cli

Scan a workspace for `node_modules` directories and move confirmed targets to
the system Trash.

## Requirements

- Node.js 22 or newer

## Usage

Run from npm without a global install:

```bash
npx uncached scan
npx uncached scan ./path/to/workspace
```

When no workspace is provided, `uncached` scans the current directory. The
command lists detected targets and asks for one confirmation. Enter lowercase
`y` to move all targets to the system Trash; any other response cancels.

`uncached` uses Trash only. It never permanently deletes files and does not
modify `package.json`, lockfiles, or files outside confirmed targets.

## Local Development

Install dependencies:

```bash
npm install
```

Run the test suite with Node's native test-file discovery:

```bash
npm test
```

## Release

Real publication requires npm authentication and availability of the
`uncached-cli` package name.

```bash
npm login
npm version patch
npm publish
npx uncached scan ./path/to/workspace
```

Preview package contents and publication metadata without publishing:

```bash
npm pack --dry-run
npm publish --dry-run
```

Test the packed CLI in a disposable project before publishing:

```bash
npm pack
mkdir ../uncached-cli-disposable
cd ../uncached-cli-disposable
npm init -y
npm install ../uncached-cli/uncached-cli-0.1.0.tgz
npx uncached scan .
```
