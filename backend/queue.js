/**
 * Очередь с дедупликацией и батчингом
 */
import { appendItems, markSelectionForUpdate, commitSelectionUpdate, getPendingSelectionUpdate, getSelection } from './memoryStore.js';

// Очередь для добавления элементов
let addQueue = new Set();
// Таймер для обработки очереди добавления (каждые 10 секунд)
let addBatchInterval = null;
// Таймер для коммита изменений состояния (каждую 1 секунду)
let commitInterval = null;

/**
 * Инициализация таймеров батчинга
 */
export function initializeBatching() {
  // Батчинг добавления: каждые 10 секунд
  addBatchInterval = setInterval(() => {
    processAddQueue();
  }, 10000);

  // Батчинг коммита изменений: каждую 1 секунду
  commitInterval = setInterval(() => {
    commitStateChanges();
  }, 1000);

  console.log('Очередь инициализирована: батчинг добавления (10 сек), коммит изменений (1 сек)');
}

/**
 * Остановка таймеров батчинга
 */
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

/**
 * Добавить ID в очередь с дедупликацией
 * @param {number[]} ids - Массив ID для добавления
 * @returns {number[]} - Массив принятых ID (после дедупликации)
 */
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

/**
 * Обработать очередь добавления (вызывается каждые 10 секунд)
 */
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

/**
 * Коммит изменений состояния (вызывается каждую 1 секунду)
 */
function commitStateChanges() {
  const pending = getPendingSelectionUpdate();
  
  if (pending) {
    commitSelectionUpdate();
    console.log(`[Commit] Updated selection: ${pending.selectedIds.length} items`);
  }
}

/**
 * Пометить selection для обновления в следующем коммите
 * @param {number[]} selectedIds - Новый список выбранных ID
 * @param {number[]} order - Новый порядок ID
 */
export function updateSelection(selectedIds, order) {
  markSelectionForUpdate(selectedIds, order);
}

/**
 * Получить текущий размер очереди (для отладки)
 * @returns {number}
 */
export function getQueueSize() {
  return addQueue.size;
}

