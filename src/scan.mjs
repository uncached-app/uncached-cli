import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';

function compareNames(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function isRegularFile(filePath) {
  try {
    return (await lstat(filePath)).isFile();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function measureDirectory(directoryPath) {
  let bytes = 0;
  const entries = (await readdir(directoryPath, { withFileTypes: true }))
    .sort((left, right) => compareNames(left.name, right.name));

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    const entryStats = await lstat(entryPath);

    if (entryStats.isSymbolicLink()) continue;
    if (entryStats.isFile()) {
      bytes += entryStats.size;
    } else if (entryStats.isDirectory()) {
      bytes += await measureDirectory(entryPath);
    }
  }

  return bytes;
}

async function hasParentPackageJson(directoryPath) {
  return isRegularFile(path.join(path.dirname(directoryPath), 'package.json'));
}

export async function scanWorkspace(workspacePath) {
  const resolvedWorkspace = path.resolve(workspacePath);
  const workspaceStats = await lstat(resolvedWorkspace);
  if (!workspaceStats.isDirectory() || workspaceStats.isSymbolicLink()) {
    throw new TypeError(`Workspace must be a directory: ${resolvedWorkspace}`);
  }

  const targets = [];

  async function visit(directoryPath) {
    const entries = (await readdir(directoryPath, { withFileTypes: true }))
    .sort((left, right) => compareNames(left.name, right.name));

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      const entryStats = await lstat(entryPath);

      if (!entryStats.isDirectory() || entryStats.isSymbolicLink()) continue;
      if (entry.name === 'node_modules') {
        if (await hasParentPackageJson(entryPath)) {
          targets.push({ path: entryPath, bytes: await measureDirectory(entryPath) });
        }
        continue;
      }

      await visit(entryPath);
    }
  }

  await visit(resolvedWorkspace);
  targets.sort((left, right) => compareNames(left.path, right.path));

  return {
    targets,
    totalBytes: targets.reduce((total, target) => total + target.bytes, 0),
  };
}
