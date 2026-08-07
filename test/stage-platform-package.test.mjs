import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import assert from 'node:assert/strict';

const execFileAsync = promisify(execFile);
const script = join(process.cwd(), 'scripts', 'stage-platform-package.mjs');

async function runStage(args) {
  try {
    const result = await execFileAsync(process.execPath, [script, ...args], { encoding: 'utf8' });
    return { code: 0, ...result };
  } catch (error) {
    return { code: error.status ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'uncached-stage-'));
  const packageDir = join(root, 'package');
  const sourceDir = join(root, 'build');
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(root, 'outside.txt'), 'must remain untouched');
  await writeFile(join(sourceDir, 'uncached-build'), 'binary fixture');
  return { root, packageDir, binary: join(sourceDir, 'uncached-build') };
}

test('stages Windows binary with expected name and checksum', async () => {
  const { packageDir, binary } = await fixture();
  const result = await runStage(['--target', 'x86_64-pc-windows-msvc', '--binary', binary, '--package-dir', packageDir]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /bin[\\/]uncached\.exe/);
  assert.match(result.stdout, /SHA-256: [a-f0-9]{64}/);
  assert.equal(await readFile(join(packageDir, 'bin', 'uncached.exe'), 'utf8'), 'binary fixture');
});

test('stages Unix binary and sets executable mode', async () => {
  const { packageDir, binary } = await fixture();
  const result = await runStage(['--target', 'x86_64-unknown-linux-gnu', '--binary', binary, '--package-dir', packageDir]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(await readFile(join(packageDir, 'bin', 'uncached'), 'utf8'), 'binary fixture');
  if (process.platform !== 'win32') assert.equal((await stat(join(packageDir, 'bin', 'uncached'))).mode & 0o777, 0o755);
});

test('rejects missing binary and unknown target without creating files', async () => {
  const { packageDir, root } = await fixture();
  const missing = await runStage(['--target', 'x86_64-unknown-linux-gnu', '--binary', join(root, 'missing'), '--package-dir', packageDir]);
  assert.notEqual(missing.code, 0);
  const unknown = await runStage(['--target', 'unknown', '--binary', join(root, 'missing'), '--package-dir', packageDir]);
  assert.notEqual(unknown.code, 0);
  await assert.rejects(stat(join(packageDir, 'bin')));
  assert.equal(await readFile(join(root, 'outside.txt'), 'utf8'), 'must remain untouched');
});
