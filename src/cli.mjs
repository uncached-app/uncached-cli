#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { lstat, realpath } from 'node:fs/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { scanWorkspace } from './scan.mjs';
import { moveToTrash } from './trash.mjs';

function printUsage(write) {
  write('Usage: uncached scan [workspace]\n');
}

function formatError(error) {
  return String(error?.message ?? error);
}

function isContained(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function hasNoSymlinkComponents(filePath) {
  const resolvedPath = path.resolve(filePath);
  const components = [];
  let current = resolvedPath;
  while (current !== path.parse(current).root) {
    components.push(current);
    current = path.dirname(current);
  }
  components.push(path.parse(resolvedPath).root);

  for (const component of components.reverse()) {
    const stats = await lstat(component);
    if (stats.isSymbolicLink()) return false;
  }
  return true;
}

export async function isSafeTarget(workspace, targetPath, scanWorkspaceRealPath) {
  const resolvedWorkspace = path.resolve(workspace);
  const resolvedTarget = path.resolve(targetPath);

  try {
    if (!(await hasNoSymlinkComponents(resolvedWorkspace))
      || !(await hasNoSymlinkComponents(resolvedTarget))) return false;

    const workspaceStats = await lstat(resolvedWorkspace);
    if (!workspaceStats.isDirectory() || workspaceStats.isSymbolicLink()) return false;
    const currentRealWorkspace = await realpath(resolvedWorkspace);
    if (scanWorkspaceRealPath && path.relative(scanWorkspaceRealPath, currentRealWorkspace) !== '') return false;
    if (scanWorkspaceRealPath && path.relative(currentRealWorkspace, scanWorkspaceRealPath) !== '') return false;

    const realTarget = await realpath(resolvedTarget);
    const realParent = await realpath(path.dirname(resolvedTarget));
    if (!isContained(currentRealWorkspace, realTarget)) return false;
    if (path.basename(realTarget) !== 'node_modules') return false;

    const targetStats = await lstat(resolvedTarget);
    if (!targetStats.isDirectory() || targetStats.isSymbolicLink()) return false;
    const packageStats = await lstat(path.join(realParent, 'package.json'));
    return packageStats.isFile() && !packageStats.isSymbolicLink();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
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
    validateTarget = isSafeTarget,
    write = (text) => stdout.write(text),
    cwd = process.cwd(),
  } = dependencies;

  if (arguments_.length < 1 || arguments_[0] !== 'scan' || arguments_.length > 2) {
    printUsage(write);
    return 1;
  }

  const workspace = arguments_.length === 2 ? arguments_[1] : cwd;
  const resolvedWorkspace = path.resolve(workspace);
  let scanWorkspaceRealPath;
  let result;
  try {
    if (validateTarget === isSafeTarget) scanWorkspaceRealPath = await realpath(resolvedWorkspace);
    result = await scan(workspace);
  } catch (error) {
    write(`Scan failed: ${formatError(error)}\n`);
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

  let answer;
  try {
    answer = await confirm();
  } catch (error) {
    write(`Confirmation failed: ${formatError(error)}\n`);
    return 1;
  }
  if (answer !== 'y') {
    write('Cancelled.\n');
    return 0;
  }

  let moved = 0;
  let failed = 0;
  for (const target of result.targets) {
    let safe;
    try {
      safe = await validateTarget(resolvedWorkspace, target.path, scanWorkspaceRealPath);
    } catch (error) {
      safe = false;
    }
    if (!safe) {
      write(`Skipped: ${target.path} (target changed or is no longer safe).\n`);
      continue;
    }
    try {
      await move(target.path);
      moved += 1;
    } catch (error) {
      failed += 1;
      write(`Failed: ${target.path}: ${formatError(error)}\n`);
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
