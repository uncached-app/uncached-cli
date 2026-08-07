#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { scanWorkspace } from './scan.mjs';
import { moveToTrash } from './trash.mjs';

function printUsage(write) {
  write('Usage: uncached scan [workspace]\n');
}

async function readConfirmation() {
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    return await readline.question('Move all targets to Trash? [y/N] ');
  } finally {
    readline.close();
  }
}

export async function runCli(arguments_, dependencies = {}) {
  const {
    scanWorkspace: scan = scanWorkspace,
    moveToTrash: move = moveToTrash,
    confirm = readConfirmation,
    write = (text) => stdout.write(text),
    cwd = process.cwd(),
  } = dependencies;

  if (arguments_.length < 1 || arguments_[0] !== 'scan' || arguments_.length > 2) {
    printUsage(write);
    return 1;
  }

  const workspace = arguments_.length === 2 ? arguments_[1] : cwd;
  let result;
  try {
    result = await scan(workspace);
  } catch (error) {
    write(`Scan failed: ${error.message}\n`);
    return 1;
  }

  for (const target of result.targets) {
    write(`${target.path} (${target.bytes} bytes)\n`);
  }
  write(`Total: ${result.totalBytes} bytes\n`);

  if (result.targets.length === 0) {
    write('No targets found.\n');
    return 0;
  }

  if ((await confirm()) !== 'y') {
    write('Cancelled.\n');
    return 0;
  }

  let moved = 0;
  let failed = 0;
  for (const target of result.targets) {
    try {
      await move(target.path);
      moved += 1;
    } catch (error) {
      failed += 1;
      write(`Failed: ${target.path}: ${error.message}\n`);
    }
  }

  write(`Moved: ${moved}; failed: ${failed}.\n`);
  return 0;
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
const modulePath = path.resolve(fileURLToPath(import.meta.url));
if (invokedPath && pathToFileURL(invokedPath).href === pathToFileURL(modulePath).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}
