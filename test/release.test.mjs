import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const quoteWindows = (value) => {
  const text = String(value);
  return /\s|"/.test(text) ? `"${text.replaceAll('"', '\\"')}"` : text;
};

function runNpm(args, options = {}) {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? process.env.ComSpec : npmCommand;
    const commandArgs = process.platform === 'win32'
      ? ['/d', '/c', `${npmCommand} ${args.map(quoteWindows).join(' ')}`]
      : args;
    const child = spawn(command, commandArgs, { cwd: options.cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ code, stdout, stderr });
      else reject(Object.assign(new Error(stderr), { code, stdout, stderr }));
    });
    child.stdin.end(options.input ?? '');
  });
}

test('packed installed executable cancels without changing targets', async (t) => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'uncached-release-'));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));

  const workspace = path.join(tempRoot, 'workspace');
  await mkdir(path.join(workspace, 'one', 'node_modules'), { recursive: true });
  await mkdir(path.join(workspace, 'two', 'node_modules'), { recursive: true });
  await writeFile(path.join(workspace, 'one', 'package.json'), '{}');
  await writeFile(path.join(workspace, 'two', 'package.json'), '{}');

  const { stdout } = await runNpm(['pack', '--json', '--pack-destination', tempRoot], { cwd: projectRoot });
  const tarball = JSON.parse(stdout)[0].filename;
  const installRoot = path.join(tempRoot, 'install');
  await mkdir(installRoot);
  await runNpm([
    'install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', installRoot,
    path.join(tempRoot, tarball),
  ], { cwd: projectRoot });

  const result = await runNpm([
    'exec', '--prefix', installRoot, '--', 'uncached', 'scan', workspace,
  ], { cwd: installRoot, input: 'N\n' }).catch((error) => error);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Cancelled/);
  assert.equal((await lstat(path.join(workspace, 'one', 'node_modules'))).isDirectory(), true);
  assert.equal((await lstat(path.join(workspace, 'two', 'node_modules'))).isDirectory(), true);
});
