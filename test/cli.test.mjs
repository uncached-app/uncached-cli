import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { isSafeTarget, runCli } from '../src/cli.mjs';

function harness({ scanResult, answer = 'n', moveToTrash = async () => {} }) {
  const output = [];
  const scanned = [];
  const moved = [];
  const moveEffects = [];

  return {
    output,
    scanned,
    moved,
    moveEffects,
    dependencies: {
      scanWorkspace: async (workspace) => {
        scanned.push(workspace);
        if (scanResult instanceof Error) throw scanResult;
        return scanResult;
      },
      moveToTrash: async (targetPath) => {
        moved.push(targetPath);
        const result = await moveToTrash(targetPath);
        moveEffects.push(targetPath);
        return result;
      },
      confirm: async () => answer,
      validateTarget: async () => true,
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

test('reports scan failure with nonzero status', async () => {
  const testHarness = harness({ scanResult: new Error('scan unavailable') });

  assert.notEqual(await runCli(['scan'], testHarness.dependencies), 0);
  assert.match(testHarness.output.join(''), /scan failed.*scan unavailable/i);
});

test('formats non-Error scan, confirmation, and move failures', async () => {
  const scanOutput = [];
  assert.equal(await runCli(['scan'], {
    scanWorkspace: async () => { throw { message: 'scan object' }; },
    write: (text) => scanOutput.push(text),
  }), 1);
  assert.match(scanOutput.join(''), /scan object/);

  const confirmationOutput = [];
  assert.equal(await runCli(['scan'], {
    scanWorkspace: async () => ({ targets: [{ path: '/workspace/node_modules', bytes: 1 }], totalBytes: 1 }),
    confirm: async () => { throw 'confirmation string'; },
    write: (text) => confirmationOutput.push(text),
  }), 1);
  assert.match(confirmationOutput.join(''), /confirmation string/);

  const moveOutput = [];
  assert.equal(await runCli(['scan'], {
    scanWorkspace: async () => ({ targets: [{ path: '/workspace/node_modules', bytes: 1 }], totalBytes: 1 }),
    confirm: async () => 'y',
    validateTarget: async () => true,
    moveToTrash: async () => { throw 42; },
    write: (text) => moveOutput.push(text),
  }), 0);
  assert.match(moveOutput.join(''), /: 42/);
});

test('asks exactly once before moving all targets', async () => {
  let confirmations = 0;
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
  testHarness.dependencies.confirm = async () => {
    confirmations += 1;
    return 'y';
  };

  assert.equal(await runCli(['scan'], testHarness.dependencies), 0);
  assert.equal(confirmations, 1);
  assert.equal(testHarness.moved.length, 2);
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

test('confirmation failure returns nonzero status and concise error', async () => {
  const testHarness = harness({
    scanResult: { targets: [{ path: '/workspace/node_modules', bytes: 10 }], totalBytes: 10 },
  });
  testHarness.dependencies.confirm = async () => {
    throw new Error('input closed');
  };

  assert.equal(await runCli(['scan'], testHarness.dependencies), 1);
  assert.deepEqual(testHarness.moved, []);
  assert.match(testHarness.output.join(''), /confirmation failed.*input closed/i);
});

test('skips targets that fail revalidation before moving', async () => {
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
  testHarness.dependencies.validateTarget = async (_workspace, targetPath) =>
    !targetPath.endsWith('/a/node_modules');

  assert.equal(await runCli(['scan'], testHarness.dependencies), 0);
  assert.deepEqual(testHarness.moveEffects, ['/workspace/b/node_modules']);
  assert.match(testHarness.output.join(''), /skipped.*a\/node_modules/i);
});

test('rejects workspace replacement with a symlink before moving', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'uncached-cli-'));
  const replacement = await mkdtemp(path.join(tmpdir(), 'uncached-cli-replacement-'));
  t.after(() => Promise.all([
    rm(root, { recursive: true, force: true }),
    rm(replacement, { recursive: true, force: true }),
  ]));
  const target = path.join(root, 'project', 'node_modules');
  await mkdir(target, { recursive: true });
  await writeFile(path.join(root, 'project', 'package.json'), '{}');
  const scanWorkspace = await realpath(root);
  await rm(root, { recursive: true });
  await symlink(replacement, root, 'junction');

  assert.equal(await isSafeTarget(root, target, scanWorkspace), false);
});

test('rejects target ancestor replacement with a symlink', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'uncached-cli-'));
  const outside = await mkdtemp(path.join(tmpdir(), 'uncached-cli-outside-'));
  t.after(() => Promise.all([
    rm(root, { recursive: true, force: true }),
    rm(outside, { recursive: true, force: true }),
  ]));
  await writeFile(path.join(root, 'package.json'), '{}');
  await mkdir(path.join(outside, 'project', 'node_modules'), { recursive: true });
  await writeFile(path.join(outside, 'project', 'package.json'), '{}');
  await symlink(outside, path.join(root, 'project'), 'junction');

  assert.equal(await isSafeTarget(root, path.join(root, 'project', 'node_modules'), await realpath(root)), false);
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
