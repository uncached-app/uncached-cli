import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { scanWorkspace } from '../src/scan.mjs';

async function workspace() {
  return mkdtemp(path.join(tmpdir(), 'uncached-scan-'));
}

test('finds valid top-level and nested node_modules targets with byte totals', async (t) => {
  const root = await workspace();
  t.after(() => rm(root, { recursive: true, force: true }));

  await writeFile(path.join(root, 'package.json'), '{}');
  await mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  await writeFile(path.join(root, 'node_modules', 'pkg', 'index.js'), 'abc');

  await mkdir(path.join(root, 'nested', 'node_modules', 'other'), { recursive: true });
  await writeFile(path.join(root, 'nested', 'node_modules', 'other', 'index.js'), '12345');
  await writeFile(path.join(root, 'nested', 'package.json'), '{}');

  const result = await scanWorkspace(root);
  const targets = [
    { path: path.resolve(root, 'nested', 'node_modules'), bytes: 5 },
    { path: path.resolve(root, 'node_modules'), bytes: 3 },
  ].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));

  assert.deepEqual(result.targets, targets);
  assert.equal(result.totalBytes, 8);
  assert.ok(result.targets.every((target) => path.isAbsolute(target.path)));
});

test('orders targets with code-unit comparison independent of locale', async (t) => {
  const root = await workspace();
  t.after(() => rm(root, { recursive: true, force: true }));

  await writeFile(path.join(root, 'package.json'), '{}');
  for (const name of ['z-project', 'a-project']) {
    await mkdir(path.join(root, name, 'node_modules'), { recursive: true });
    await writeFile(path.join(root, name, 'package.json'), '{}');
  }

  const result = await scanWorkspace(root);
  assert.deepEqual(result.targets.map((target) => path.basename(path.dirname(target.path))), [
    'a-project',
    'z-project',
  ]);
});

test('ignores node_modules without a parent package.json', async (t) => {
  const root = await workspace();
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  await writeFile(path.join(root, 'node_modules', 'pkg', 'index.js'), 'ignored');

  assert.deepEqual(await scanWorkspace(root), { targets: [], totalBytes: 0 });
});

test('does not scan nested node_modules under a detected target', async (t) => {
  const root = await workspace();
  t.after(() => rm(root, { recursive: true, force: true }));

  await writeFile(path.join(root, 'package.json'), '{}');
  await mkdir(path.join(root, 'node_modules', 'outer', 'node_modules', 'inner'), { recursive: true });
  await writeFile(path.join(root, 'node_modules', 'outer', 'file.js'), 'outer');
  await writeFile(path.join(root, 'node_modules', 'outer', 'node_modules', 'inner', 'file.js'), 'inner');

  const result = await scanWorkspace(root);
  assert.deepEqual(result.targets, [{ path: path.resolve(root, 'node_modules'), bytes: 10 }]);
});

test('ignores symbolic-link directories', async (t) => {
  const root = await workspace();
  t.after(() => rm(root, { recursive: true, force: true }));

  await writeFile(path.join(root, 'package.json'), '{}');
  await mkdir(path.join(root, 'real-node_modules'));
  await symlink(path.join(root, 'real-node_modules'), path.join(root, 'node_modules'), 'junction');

  const result = await scanWorkspace(root);
  assert.deepEqual(result, { targets: [], totalBytes: 0 });
});

test('rejects a missing workspace', async () => {
  await assert.rejects(
    scanWorkspace(path.join(tmpdir(), 'uncached-scan-missing')),
    /workspace.*directory|ENOENT/i,
  );
});

test('rejects a file passed as workspace', async (t) => {
  const root = await workspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'workspace.txt');
  await writeFile(file, 'file');

  await assert.rejects(scanWorkspace(file), /workspace.*directory/i);
});
