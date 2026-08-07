#!/usr/bin/env node

import { chmod, copyFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';

const TARGETS = Object.freeze({
  'x86_64-pc-windows-msvc': { binary: 'uncached.exe' },
  'x86_64-apple-darwin': { binary: 'uncached' },
  'aarch64-apple-darwin': { binary: 'uncached' },
  'x86_64-unknown-linux-gnu': { binary: 'uncached' },
});

function usageError(message) {
  throw new Error(`${message}\nUsage: stage-platform-package.mjs --target <triple> --binary <path> --package-dir <path>`);
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!['--target', '--binary', '--package-dir'].includes(name) || !value || value.startsWith('--')) {
      usageError(`Invalid argument: ${name ?? '(missing)'}`);
    }
    values[name.slice(2)] = value;
  }
  if (!values.target || !values.binary || !values['package-dir']) usageError('All arguments are required');
  return values;
}

function insideDirectory(file, directory) {
  const relative = resolve(file).slice(resolve(directory).length);
  return relative.startsWith(sep) && !relative.includes(`${sep}..${sep}`);
}

async function main(argv) {
  const { target, binary, 'package-dir': packageDir } = parseArgs(argv);
  const targetInfo = TARGETS[target];
  if (!targetInfo) usageError(`Unknown target: ${target}`);

  const input = resolve(binary);
  const destination = resolve(packageDir, 'bin', targetInfo.binary);
  try {
    const inputStat = await stat(input);
    if (!inputStat.isFile()) throw new Error('input is not a file');
  } catch (error) {
    throw new Error(`Binary not found: ${input} (${error.message})`);
  }
  if (!insideDirectory(destination, packageDir)) throw new Error('Refusing destination outside package directory');

  await mkdir(dirname(destination), { recursive: true });
  await copyFile(input, destination);
  if (targetInfo.binary === 'uncached') await chmod(destination, 0o755);

  const checksum = createHash('sha256').update(await readFile(destination)).digest('hex');
  console.log(`Staged ${destination}`);
  console.log(`SHA-256: ${checksum}`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
