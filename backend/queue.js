import { appendItems, markSelectionForUpdate, commitSelectionUpdate, getPendingSelectionUpdate, getSelection } from './memoryStore.js';

let addQueue = new Set();
let addBatchInterval = null;
let commitInterval = null;

export function initializeBatching() {
  addBatchInterval = setInterval(() => {
    processAddQueue();
  }, 10000);

  commitInterval = setInterval(() => {
    commitStateChanges();
  }, 1000);

  console.log('Очередь инициализирована: батчинг добавления (10 сек), коммит изменений (1 сек)');
}

export function stopBatching() {
  if (addBatchInterval) {
    clearInterval(addBatchInterval);
    addBatchInterval = null;
  }
  if (commitInterval) {
    clearInterval(commitInterval);
    commitInterval = null;
  }
}

export function enqueueAdd(ids) {
  const accepted = [];
  const skipped = [];
  
  const currentSelection = getSelection();
  const selectedIdsSet = new Set(currentSelection.selectedIds);

  for (const id of ids) {
    if (!addQueue.has(id) && !selectedIdsSet.has(id)) {
      addQueue.add(id);
      accepted.push(id);
    } else {
      skipped.push(id);
    }
  }

  if (accepted.length > 0) {
    console.log(`[enqueueAdd] Added ${accepted.length} items to queue`);
  }
  if (skipped.length > 0) {
    console.log(`[enqueueAdd] Skipped ${skipped.length} duplicates`);
  }

  return accepted;
}

function processAddQueue() {
  if (addQueue.size === 0) {
    return;
  }

  const idsToProcess = Array.from(addQueue);
  addQueue.clear();

  console.log(`[Batch] Processing ${idsToProcess.length} items`);

  const currentSelection = getSelection();
  const newSelectedIds = [...new Set([...currentSelection.selectedIds, ...idsToProcess])];
  const newOrder = [...new Set([...currentSelection.order, ...idsToProcess])];
  
  markSelectionForUpdate(newSelectedIds, newOrder);
}

function commitStateChanges() {
  const pending = getPendingSelectionUpdate();
  
  if (pending) {
    commitSelectionUpdate();
    console.log(`[Commit] Updated selection: ${pending.selectedIds.length} items`);
  }
}

export function updateSelection(selectedIds, order) {
  markSelectionForUpdate(selectedIds, order);
}

export function getQueueSize() {
  return addQueue.size;
}

