import { useState, useEffect, useCallback, useRef } from 'react';
import { FixedSizeList } from 'react-window';
import { getItems } from '../api';

const InfiniteList = ({ onItemSelect, filterId }) => {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const listRef = useRef(null);
  const loadingRef = useRef(false);

  const ITEM_HEIGHT = 50;
  const LIMIT = 50;

  const loadItems = useCallback(async (offset = 0, append = false) => {
    if (loadingRef.current) return;
    
    loadingRef.current = true;
    setLoading(true);
    try {
      const result = await getItems({
        filterId,
        offset,
        limit: LIMIT,
      });

      if (append) {
        setItems((prev) => [...prev, ...result.items]);
      } else {
        setItems(result.items);
      }

      setTotal(result.total);
      setHasMore(offset + result.items.length < result.total);
    } catch (error) {
      console.error('Error loading items:', error);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [filterId]);

  useEffect(() => {
    setItems([]);
    setHasMore(true);
    loadItems(0, false);
  }, [filterId, loadItems]);

  const onItemsRendered = useCallback(({ visibleStopIndex }) => {
    if (visibleStopIndex >= items.length - 5 && hasMore && !loadingRef.current) {
      loadItems(items.length, true);
    }
  }, [items.length, hasMore, loadItems]);

  const Row = ({ index, style }) => {
    const item = items[index];
    if (!item) return null;

    return (
      <div
        style={style}
        onClick={() => onItemSelect && onItemSelect(item)}
        className="list-item"
      >
        <div style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
          <strong>ID: {item.id}</strong>
          <div style={{ fontSize: '12px', color: '#666' }}>
            {new Date(item.createdAt).toLocaleString()}
          </div>
        </div>
      </div>
    );
  };

  if (loading && items.length === 0) {
    return <div style={{ padding: '20px' }}>Загрузка...</div>;
  }

  return (
    <div>
      <FixedSizeList
        ref={listRef}
        height={600}
        itemCount={items.length}
        itemSize={ITEM_HEIGHT}
        width="100%"
        onItemsRendered={onItemsRendered}
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
    </div>
  );
};

export default InfiniteList;

