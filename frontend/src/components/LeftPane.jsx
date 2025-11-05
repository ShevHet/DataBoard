import { useState, useEffect, useCallback, useRef } from 'react';
import { FixedSizeList } from 'react-window';
import { getItems, addToQueue, getSelection } from '../api';
import { arraysEqual } from '../utils/shallowCompare';

const LeftPane = () => {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filterId, setFilterId] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [addingIds, setAddingIds] = useState(new Set());
  
  const loadingRef = useRef(false);
  const listRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const abortControllerRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const prevSelectedIdsRef = useRef([]);
  const isInitialLoadRef = useRef(true);

  const ITEM_HEIGHT = 60;
  const LIMIT = 20;

  const loadSelectedIds = useCallback(async (signal) => {
    try {
      const sel = await getSelection({ signal });
      const newSelectedIds = Array.isArray(sel.selectedIds) ? sel.selectedIds : [];
      
      setSelectedIds((prev) => {
        if (arraysEqual(prev, newSelectedIds)) {
          return prev;
        }
        return newSelectedIds;
      });
      
      return newSelectedIds;
    } catch (err) {
      if (err.name === 'AbortError') {
        return [];
      }
      console.error('[loadSelectedIds] Error:', err);
      return [];
    }
  }, []);

  const loadItems = useCallback(async (offset = 0, append = false, excludeIds = [], signal, preserveScroll = false) => {
    let actualSignal = signal;
    let controller = null;
    
    if (!actualSignal) {
      controller = new AbortController();
      abortControllerRef.current = controller;
      actualSignal = controller.signal;
    }

    if (loadingRef.current && append) {
      return;
    }

    loadingRef.current = true;
    setLoading(true);

    try {
      const filterIdValue = filterId && filterId.trim() !== '' ? Number(filterId) : undefined;
      
      const result = await getItems({
        filterId: filterIdValue,
        offset,
        limit: LIMIT,
        excludeSelectedIds: excludeIds,
        signal: actualSignal,
      });

      if (!result || !result.items || !Array.isArray(result.items)) {
        return;
      }

      if (append) {
        setItems((prev) => {
          const excludeSet = new Set(excludeIds || []);
          const filteredPrev = prev.filter(item => !excludeSet.has(item.id));
          const existingIds = new Set(filteredPrev.map(i => i.id));
          const newItems = result.items.filter(i => !existingIds.has(i.id));
          const merged = [...filteredPrev, ...newItems];
          
          if (listRef.current?.resetAfterIndex) {
            listRef.current.resetAfterIndex(0, true);
          }
          
          return merged;
        });
      } else {
        setItems(result.items);
        
        if (!preserveScroll) {
          setTimeout(() => {
            if (listRef.current) {
              listRef.current.scrollToItem(0);
            }
          }, 100);
        }
      }

      setTotal((prev) => prev !== result.total ? result.total : prev);
      const newHasMore = offset + (result.items?.length || 0) < (result.total || 0);
      setHasMore((prev) => prev !== newHasMore ? newHasMore : prev);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[loadItems] Error:', err);
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
      if (controller && abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [filterId]);

  const addQueueBuffer = useRef([]);
  const addBatchTimeoutRef = useRef(null);
  const isFlushingRef = useRef(false);
  const BATCH_DELAY = 300;

  const flushAddQueue = useCallback(async () => {
    if (isFlushingRef.current || addQueueBuffer.current.length === 0) {
      return;
    }

    const idsToAdd = [...addQueueBuffer.current];
    addQueueBuffer.current = [];
    isFlushingRef.current = true;

    try {
      const result = await addToQueue(idsToAdd);
      
      if (result.accepted && result.accepted.length > 0) {
        setAddingIds((prev) => {
          const next = new Set(prev);
          result.accepted.forEach(id => next.delete(id));
          return next;
        });
      } else {
        setAddingIds((prev) => {
          const next = new Set(prev);
          idsToAdd.forEach(id => next.delete(id));
          return next;
        });
      }
    } catch (error) {
      console.error('[flushAddQueue] Error:', error);
      alert(`Error: ${error.error || 'Failed to add to queue'}`);
      
      addQueueBuffer.current.push(...idsToAdd);
      setAddingIds((prev) => {
        const next = new Set(prev);
        idsToAdd.forEach(id => next.delete(id));
        return next;
      });
    } finally {
      isFlushingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const runOnce = async () => {
      if (!mounted) return;

      const selectionController = new AbortController();
      
      try {
        const freshSelected = await loadSelectedIds(selectionController.signal);
        
        if (selectionController.signal.aborted) {
          return;
        }
        
        const excludeIds = Array.isArray(freshSelected) ? freshSelected : [];
        const prevSelected = prevSelectedIdsRef.current;
        const selectedChanged = !arraysEqual(prevSelected, excludeIds);
        
        if (isInitialLoadRef.current) {
          isInitialLoadRef.current = false;
          const itemsController = new AbortController();
          abortControllerRef.current = itemsController;
          await loadItems(0, false, excludeIds, itemsController.signal, false);
          prevSelectedIdsRef.current = excludeIds;
        } else if (selectedChanged) {
          setItems((prev) => {
            const excludeSet = new Set(excludeIds);
            const filtered = prev.filter(item => !excludeSet.has(item.id));
            
            if (listRef.current?.resetAfterIndex) {
              listRef.current.resetAfterIndex(0, true);
            }
            
            return filtered;
          });
          
          prevSelectedIdsRef.current = excludeIds;
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[runOnce] Error:', err);
        }
      }
    };

    runOnce();

    pollingIntervalRef.current = setInterval(() => {
      if (mounted) {
        runOnce();
      }
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      if (abortControllerRef.current) {
        try {
          abortControllerRef.current.abort();
        } catch (e) {
          // Ignore
        }
      }
      if (addBatchTimeoutRef.current) {
        clearTimeout(addBatchTimeoutRef.current);
        addBatchTimeoutRef.current = null;
      }
      if (addQueueBuffer.current.length > 0) {
        flushAddQueue();
      }
    };
  }, [filterId, loadSelectedIds, loadItems, flushAddQueue]);

  useEffect(() => {
    setItems([]);
    setHasMore(true);
    isInitialLoadRef.current = true;
    prevSelectedIdsRef.current = [];
    scrollOffsetRef.current = 0;
  }, [filterId]);

  const onItemsRendered = useCallback(({ visibleStopIndex }) => {
    if (visibleStopIndex >= items.length - 5 && hasMore && !loadingRef.current) {
      loadItems(items.length, true, selectedIds, undefined);
    }
  }, [items.length, hasMore, selectedIds, loadItems]);

  const handleAddToQueue = useCallback((id) => {
    setAddingIds((prev) => {
      if (prev.has(id)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    if (!addQueueBuffer.current.includes(id)) {
      addQueueBuffer.current.push(id);
    }

    if (addBatchTimeoutRef.current) {
      clearTimeout(addBatchTimeoutRef.current);
    }

    addBatchTimeoutRef.current = setTimeout(() => {
      flushAddQueue();
      addBatchTimeoutRef.current = null;
    }, BATCH_DELAY);
  }, [flushAddQueue]);

  const Row = ({ index, style }) => {
    const item = items[index];
    if (!item) return <div style={style}>Loading…</div>;

    const isAdding = addingIds.has(item.id);

    return (
      <div style={style}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 15px',
            borderBottom: '1px solid #eee',
            height: '100%',
          }}
          className="list-item"
        >
          <div style={{ flex: 1 }}>
            <strong>ID: {item.id}</strong>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              {new Date(item.createdAt).toLocaleString()}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleAddToQueue(item.id);
            }}
            disabled={isAdding}
            style={{
              padding: '8px 16px',
              backgroundColor: isAdding ? '#ccc' : '#2196f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isAdding ? 'not-allowed' : 'pointer',
              fontSize: '14px',
            }}
          >
            {isAdding ? 'Добавление...' : 'Добавить'}
          </button>
        </div>
      </div>
    );
  };

  const handleFilterChange = (e) => {
    const value = e.target.value.trim();
    setFilterId(value);
  };

  if (loading && items.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Список элементов</h2>
        <div>Загрузка...</div>
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%',
      padding: '20px'
    }}>
      <h2>Список элементов</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Фильтр по ID (например: 123)"
          value={filterId}
          onChange={handleFilterChange}
          disabled={loading}
          style={{
            padding: '8px 12px',
            width: '100%',
            maxWidth: '300px',
            fontSize: '14px',
            border: '1px solid #ddd',
            borderRadius: '4px',
          }}
        />
      </div>

      <div style={{ marginBottom: '10px', fontSize: '14px', color: '#666', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
          Показано: <span style={{ color: items.length > 0 ? '#2e7d32' : '#f57c00' }}>{items.length}</span> из {total}
        </div>
        <div style={{ fontSize: '12px', color: '#666' }}>
          Первые 5 ID: {items.length > 0 ? items.slice(0, 5).map(i => i.id).join(', ') : 'нет элементов'}
        </div>
        <div style={{ marginTop: '5px', padding: '5px', backgroundColor: selectedIds.length > 0 ? '#e8f5e9' : '#fff3e0', borderRadius: '4px' }}>
          <strong>Selection:</strong> {selectedIds.length > 0 ? (
            <span style={{ color: '#2e7d32' }}>
              {selectedIds.length} элементов [ID: {selectedIds.slice(0, 10).join(', ')}{selectedIds.length > 10 ? '...' : ''}]
            </span>
          ) : (
            <span style={{ color: '#f57c00' }}>пусто</span>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {items.length > 0 ? (
          <>
            <FixedSizeList
              ref={listRef}
              height={600}
              itemCount={items.length}
              itemSize={ITEM_HEIGHT}
              width="100%"
              onItemsRendered={onItemsRendered}
              itemKey={index => items[index]?.id ?? index}
            >
              {Row}
            </FixedSizeList>
            {loading && items.length > 0 && (
              <div style={{ padding: '10px', textAlign: 'center' }}>
                Загрузка...
              </div>
            )}
            {!hasMore && items.length > 0 && (
              <div style={{ padding: '10px', textAlign: 'center', color: '#666' }}>
                Все элементы загружены
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            {filterId ? 'Элементы не найдены' : 'Нет доступных элементов'}
          </div>
        )}
      </div>
    </div>
  );
};

export default LeftPane;
