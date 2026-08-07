import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runCli } from '../src/cli.mjs';

function harness({ scanResult, answer = 'n', moveToTrash = async () => {} }) {
  const output = [];
  const scanned = [];
  const moved = [];

  return {
    output,
    scanned,
    moved,
    dependencies: {
      scanWorkspace: async (workspace) => {
        scanned.push(workspace);
        if (scanResult instanceof Error) throw scanResult;
        return scanResult;
      },
      moveToTrash: async (targetPath) => {
        moved.push(targetPath);
        return moveToTrash(targetPath);
      },
      confirm: async () => answer,
      write: (text) => output.push(text),
    },
  };
}

test('scans default workspace and prints target paths, sizes, and total', async () => {
  const result = {
    targets: [{ path: '/workspace/node_modules', bytes: 2048 }],
    totalBytes: 2048,
  };
  const testHarness = harness({ scanResult: result });

  const status = await runCli(['scan'], {
    ...testHarness.dependencies,
    cwd: '/default/workspace',
  });

  assert.equal(status, 0);
  assert.deepEqual(testHarness.scanned, ['/default/workspace']);
  assert.match(testHarness.output.join(''), /\/workspace\/node_modules/);
  assert.match(testHarness.output.join(''), /2048/);
  assert.match(testHarness.output.join(''), /total/i);
});

test('scans explicit workspace path', async () => {
  const testHarness = harness({ scanResult: { targets: [], totalBytes: 0 } });

  assert.equal(await runCli(['scan', './project'], testHarness.dependencies), 0);
  assert.deepEqual(testHarness.scanned, ['./project']);
});

test('prints empty scan without asking for confirmation', async () => {
  let confirmations = 0;
  const testHarness = harness({ scanResult: { targets: [], totalBytes: 0 } });
  testHarness.dependencies.confirm = async () => {
    confirmations += 1;
    return 'y';
  };

  assert.equal(await runCli(['scan'], testHarness.dependencies), 0);
  assert.equal(confirmations, 0);
  assert.match(testHarness.output.join(''), /no targets|empty/i);
});

test('rejects invalid subcommands and too many arguments', async () => {
  const testHarness = harness({ scanResult: { targets: [], totalBytes: 0 } });

  assert.notEqual(await runCli(['clean'], testHarness.dependencies), 0);
  assert.notEqual(await runCli(['scan', 'one', 'two'], testHarness.dependencies), 0);
  assert.match(testHarness.output.join(''), /usage|invalid|arguments/i);
});

test('cancellation does not move targets', async () => {
  const testHarness = harness({
    answer: 'N',
    scanResult: { targets: [{ path: '/workspace/node_modules', bytes: 10 }], totalBytes: 10 },
  });

  assert.equal(await runCli(['scan'], testHarness.dependencies), 0);
  assert.deepEqual(testHarness.moved, []);
  assert.match(testHarness.output.join(''), /cancel/i);
});

test('lowercase y moves every target', async () => {
  const testHarness = harness({
    answer: 'y',
    scanResult: {
      targets: [
        { path: '/workspace/a/node_modules', bytes: 10 },
        { path: '/workspace/b/node_modules', bytes: 20 },
      ],
      totalBytes: 30,
    },
  });

  assert.equal(await runCli(['scan'], testHarness.dependencies), 0);
  assert.deepEqual(testHarness.moved, [
    '/workspace/a/node_modules',
    '/workspace/b/node_modules',
  ]);
});

test('continues moving later targets after one move fails', async () => {
  const failure = new Error('permission denied');
  const testHarness = harness({
    answer: 'y',
    scanResult: {
      targets: [
        { path: '/workspace/a/node_modules', bytes: 10 },
        { path: '/workspace/b/node_modules', bytes: 20 },
      ],
      totalBytes: 30,
    },
    moveToTrash: async (targetPath) => {
      if (targetPath.endsWith('/a/node_modules')) throw failure;
    },
  });

  assert.equal(await runCli(['scan'], testHarness.dependencies), 0);
  assert.deepEqual(testHarness.moved, [
    '/workspace/a/node_modules',
    '/workspace/b/node_modules',
  ]);
  assert.match(testHarness.output.join(''), /a\/node_modules/);
  assert.match(testHarness.output.join(''), /permission denied/);
});
