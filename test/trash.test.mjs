import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTrashMover } from '../src/trash.mjs';

test('passes one exact target path to the injected Trash operation', async () => {
  const targetPath = '/workspace/node_modules';
  const calls = [];
  const moveToTrash = createTrashMover(async (...arguments_) => {
    calls.push(arguments_);
  });

  await moveToTrash(targetPath);

  assert.deepEqual(calls, [[targetPath]]);
});

test('propagates injected Trash operation errors unchanged', async () => {
  const error = new Error('Trash unavailable');
  const moveToTrash = createTrashMover(async () => {
    throw error;
  });

  await assert.rejects(moveToTrash('/workspace/node_modules'), (received) => received === error);
});
