import trash from 'trash';

export function createTrashMover(trashFn) {
  return async (targetPath) => trashFn(targetPath);
}

export const moveToTrash = createTrashMover(trash);
