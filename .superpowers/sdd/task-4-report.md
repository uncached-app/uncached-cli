# Task 4 Report: CLI Flow

## Scope

Implemented Task 4 in the requested CLI and test files. The CLI supports only
`scan` with zero or one workspace argument. No flags or additional commands were
added.

## Implementation

- Added executable `src/cli.mjs` wired to the existing `scanWorkspace` and
  `moveToTrash` exports.
- Defaults workspace to `process.cwd()` when no path is provided.
- Rejects missing, unsupported, and overlong argument lists with usage output and
  status `1`.
- Prints each target path and byte size, followed by total bytes.
- Prints an empty-scan message and exits `0` without prompting when no targets
  are found.
- Prompts exactly once when targets exist. Only exact lowercase `y` confirms;
  every other response cancels with status `0`.
- Calls `moveToTrash` once per target after confirmation.
- Continues after move failures, reports each failed target and error message,
  and exits `0` after the scan completes.
- Exports `runCli` with injectable scan, move, confirmation, output, and cwd
  boundaries so tests never move real user files.

## Tests

Added `test/cli.test.mjs` covering:

- Default and explicit workspace paths.
- Empty scans.
- Invalid subcommands and too many arguments.
- Confirmation cancellation.
- Lowercase `y` moving every target.
- A failed move followed by later move attempts.
- Human-readable target, size, total, and failure output.

## TDD Evidence

The focused suite was run before `src/cli.mjs` existed:

```text
node --test test/cli.test.mjs
ERR_MODULE_NOT_FOUND: ...\\src\\cli.mjs
```

After the minimal implementation, focused tests passed.

## Verification

```text
node --test test/cli.test.mjs
7 passed, 0 failed

npm test
15 passed, 0 failed
```

## Concerns

- Move failures are intentionally nonfatal per brief; command status remains
  `0` after a successful scan even when one or more targets fail.
- CLI output uses raw byte counts rather than human-size formatting to keep
  output deterministic and avoid adding an unrequested formatting feature.
