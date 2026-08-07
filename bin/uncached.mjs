#!/usr/bin/env node

import { createRequire } from 'node:module';
import { spawn as childSpawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

const PLATFORM_PACKAGES = Object.freeze({
  'win32/x64': '@uncached/cli-win32-x64',
  'darwin/arm64': '@uncached/cli-darwin-arm64',
  'darwin/x64': '@uncached/cli-darwin-x64',
  'linux/x64': '@uncached/cli-linux-x64',
});

const PLATFORM_BINARIES = Object.freeze({
  win32: 'bin/uncached.exe',
  darwin: 'bin/uncached',
  linux: 'bin/uncached',
});

export function resolvePlatformPackage(platform, arch) {
  return PLATFORM_PACKAGES[`${platform}/${arch}`];
}

export function resolvePlatformBinary(platform) {
  return PLATFORM_BINARIES[platform];
}

function locatePackagedBinary(packageName, platform) {
  return require.resolve(`${packageName}/${resolvePlatformBinary(platform)}`);
}

function waitForChild(child) {
  return new Promise((resolve) => {
    child.once('error', () => resolve(1));
    child.once('close', (code) => resolve(code ?? 1));
  });
}

export async function runLauncher({
  platform = process.platform,
  arch = process.arch,
  args = process.argv.slice(2),
  locateBinary = locatePackagedBinary,
  spawn = childSpawn,
  writeError = (message) => process.stderr.write(`${message}\n`),
} = {}) {
  const packageName = resolvePlatformPackage(platform, arch);
  if (!packageName) {
    writeError(`Unsupported platform/architecture: ${platform}/${arch}. Supported platforms: Windows x64, macOS arm64/x64, Linux x64.`);
    return 1;
  }

  let binary;
  try {
    binary = await locateBinary(packageName, platform);
  } catch {
    writeError(`Install optional package ${packageName} for this platform before running uncached.`);
    return 1;
  }

  const child = spawn(binary, args, { stdio: 'inherit' });
  return waitForChild(child);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runLauncher();
}
