import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

import { resolvePlatformPackage, runLauncher } from '../bin/uncached.mjs';

test('maps supported platforms to exactly one native package', () => {
  assert.equal(resolvePlatformPackage('win32', 'x64'), '@uncached/cli-win32-x64');
  assert.equal(resolvePlatformPackage('darwin', 'arm64'), '@uncached/cli-darwin-arm64');
  assert.equal(resolvePlatformPackage('darwin', 'x64'), '@uncached/cli-darwin-x64');
  assert.equal(resolvePlatformPackage('linux', 'x64'), '@uncached/cli-linux-x64');
  assert.equal(resolvePlatformPackage('linux', 'arm64'), undefined);
  assert.equal(resolvePlatformPackage('freebsd', 'x64'), undefined);
});

test('forwards arguments and propagates child exit code', async () => {
  const child = new EventEmitter();
  const calls = [];
  const exitCode = await runLauncher({
    platform: 'linux',
    arch: 'x64',
    args: ['scan', '--path', 'workspace with spaces'],
    locateBinary: async (packageName) => {
      calls.push(['locate', packageName]);
      return '/native/uncached';
    },
    spawn: (binary, args, options) => {
      calls.push(['spawn', binary, args, options]);
      queueMicrotask(() => child.emit('close', 17));
      return child;
    },
  });

  assert.equal(exitCode, 17);
  assert.deepEqual(calls, [
    ['locate', '@uncached/cli-linux-x64'],
    ['spawn', '/native/uncached', ['scan', '--path', 'workspace with spaces'], { stdio: 'inherit' }],
  ]);
});

test('reports unsupported platforms and missing native packages', async () => {
  const errors = [];
  assert.equal(await runLauncher({
    platform: 'freebsd',
    arch: 'x64',
    writeError: (message) => errors.push(message),
  }), 1);
  assert.match(errors[0], /Unsupported platform\/architecture: freebsd\/x64/);

  errors.length = 0;
  assert.equal(await runLauncher({
    platform: 'linux',
    arch: 'x64',
    locateBinary: async () => { throw new Error('MODULE_NOT_FOUND'); },
    writeError: (message) => errors.push(message),
  }), 1);
  assert.match(errors[0], /Install optional package @uncached\/cli-linux-x64/);
});

test('launcher source contains no legacy scanner implementation terms', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../bin/uncached.mjs', import.meta.url), 'utf8'));
  assert.doesNotMatch(source, /scanWorkspace|moveToTrash|node_modules|readline|recursive|path\.relative/);
});
