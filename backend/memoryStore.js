const TOTAL_ITEMS = 1_000_000;

let existingIds = new Set();
let addedItems = new Map();

let selection = {
  selectedIds: [],
  order: []
};

let pendingSelectionUpdate = null;

function generateItem(id) {
  if (addedItems.has(id)) {
    return addedItems.get(id);
  }
  return {
    id,
    createdAt: new Date().toISOString()
  };
}

function matchesFilter(id, filterStr) {
  return id.toString().includes(filterStr);
}

export function listItems({ filterId, offset = 0, limit = 50, excludeSelectedIds = [] }) {
  const excludeSet = new Set(excludeSelectedIds);
  const filterStr = filterId !== undefined && filterId !== null ? filterId.toString() : null;
  
  if (!filterStr && excludeSelectedIds.length === 0) {
    const result = [];
    const startId = offset + 1;
    const endId = Math.min(startId + limit, TOTAL_ITEMS + 1);
    
    for (let id = startId; id < endId; id++) {
      result.push(generateItem(id));
    }
    
    return {
      total: TOTAL_ITEMS,
      items: result
    };
  }

  const result = [];
  let count = 0;
  let skipped = 0;
  let total = 0;

  for (let id = 1; id <= TOTAL_ITEMS; id++) {
    if (excludeSet.has(id)) {
      continue;
    }

    if (filterStr && !matchesFilter(id, filterStr)) {
      continue;
    }

    total++;

    if (skipped < offset) {
      skipped++;
      continue;
    }

    if (count >= limit) {
      continue;
    }

    result.push(generateItem(id));
    count++;
  }

  return {
    total,
    items: result
  };
}

export function getItemsByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }

  return ids.map(id => {
    if (id >= 1 && id <= TOTAL_ITEMS) {
      return generateItem(id);
    }
    if (addedItems.has(id)) {
      return addedItems.get(id);
    }
    return null;
  }).filter(Boolean);
}

export function hasId(id) {
  return id >= 1 && id <= TOTAL_ITEMS || existingIds.has(id);
}

export function appendItems(ids) {
  const addedIds = [];
  const now = new Date().toISOString();
  
  for (const id of ids) {
    if (!existingIds.has(id) && (id < 1 || id > TOTAL_ITEMS)) {
      addedItems.set(id, {
        id,
        createdAt: now
      });
      existingIds.add(id);
      addedIds.push(id);
    }
  }
  
  return addedIds;
}

export function getSelection() {
  return {
    selectedIds: [...selection.selectedIds],
    order: [...selection.order]
  };
}

export function markSelectionForUpdate(selectedIds, order) {
  pendingSelectionUpdate = {
    selectedIds: [...selectedIds],
    order: [...order]
  };
}

export function getPendingSelectionUpdate() {
  return pendingSelectionUpdate;
}

export function commitSelectionUpdate() {
  if (pendingSelectionUpdate) {
    selection.selectedIds = [...pendingSelectionUpdate.selectedIds];
    selection.order = [...pendingSelectionUpdate.order];
    pendingSelectionUpdate = null;
  }
}

export function updateSelection(selectedIds, order) {
  selection.selectedIds = [...selectedIds];
  selection.order = [...order];
}

