import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getSelection, updateSelection, getItemsByIds } from '../api';
import { selectionEqual, itemsEqual } from '../utils/shallowCompare';

/**
 * Sortable элемент
 */
const SortableItem = ({ id, item }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    marginBottom: '10px',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '15px',
          backgroundColor: '#f5f5f5',
          border: '1px solid #ddd',
          borderRadius: '4px',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        <div style={{ flex: 1 }}>
          <strong>ID: {item.id}</strong>
          {item.createdAt && (
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              {new Date(item.createdAt).toLocaleString()}
            </div>
          )}
        </div>
        <div style={{ marginLeft: '10px', color: '#999', fontSize: '20px' }}>⋮⋮</div>
      </div>
    </div>
  );
};

/**
 * Правая панель: выбранные элементы с drag & drop
 */
const RightPane = () => {
  const [selection, setSelection] = useState({
    selectedIds: [],
    order: [],
  });
  const [items, setItems] = useState([]);
  const [updating, setUpdating] = useState(false);
  const [filterId, setFilterId] = useState('');
  const pollingIntervalRef = useRef(null);

  const LIMIT = 20;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Загрузка данных элементов по ID
  const loadItemsData = useCallback(async (idsToLoad, append = false) => {
    try {
      const ids = idsToLoad;
      if (!ids || ids.length === 0) {
        if (!append) {
          setItems([]);
        }
        return;
      }

      // Определяем, сколько элементов уже загружено
      const currentItems = append ? items : [];
      const loadedIds = new Set(currentItems.map(item => item.id));
      const remainingIds = ids.filter(id => !loadedIds.has(id));

      if (remainingIds.length === 0 && append) {
        return;
      }

      const idsToLoadNow = remainingIds.length > 0 
        ? remainingIds.slice(0, LIMIT)
        : ids.slice(0, LIMIT);
      
      const result = await getItemsByIds(idsToLoadNow);

      const itemsMap = new Map(result.items.map(item => [item.id, item]));
      const newItems = idsToLoadNow
        .map(id => itemsMap.get(id))
        .filter(item => item !== undefined);

      if (append && currentItems.length > 0) {
        const existingMap = new Map(currentItems.map(item => [item.id, item]));
        const combinedItems = ids
          .map(id => existingMap.get(id) || itemsMap.get(id))
          .filter(item => item !== undefined);
        
        setItems((prev) => {
          if (itemsEqual(prev, combinedItems)) {
            return prev;
          }
          return combinedItems;
        });
      } else {
        setItems((prev) => {
          if (itemsEqual(prev, newItems)) {
            return prev;
          }
          return newItems;
        });
      }
    } catch (error) {
      console.error('Error loading items data:', error);
    }
  }, [items]);

  // Загрузка selection с сервера
  const loadSelection = useCallback(async () => {
    try {
      const data = await getSelection();
      
      setSelection((prev) => {
        if (selectionEqual(prev, data)) {
          return prev;
        }
        return data;
      });
      
      if (data.order.length > 0) {
        const currentIds = new Set(items.map(item => item.id));
        const newIds = new Set(data.order);
        const hasChanged = data.order.length !== items.length || 
          data.order.some(id => !currentIds.has(id));
        
        if (hasChanged || items.length === 0) {
          await loadItemsData(data.order, false);
        }
      } else {
        setItems((prev) => prev.length > 0 ? [] : prev);
      }
    } catch (error) {
      console.error('Error loading selection:', error);
    }
  }, [items, loadItemsData]);

  // Polling: опрос сервера каждую секунду
  useEffect(() => {
    loadSelection();

    pollingIntervalRef.current = setInterval(() => {
      loadSelection();
    }, 1000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [loadSelection]);


  // Обработка drag & drop
  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = selection.order.indexOf(active.id);
      const newIndex = selection.order.indexOf(over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = arrayMove(selection.order, oldIndex, newIndex);
      const newSelection = {
        ...selection,
        order: newOrder,
      };

      setSelection(newSelection);

      const itemsMap = new Map(items.map(item => [item.id, item]));
      const newItems = newOrder
        .map(id => itemsMap.get(id))
        .filter(item => item !== undefined);
      
      const missingIds = newOrder.filter(id => !itemsMap.has(id));
      if (missingIds.length > 0) {
        try {
          const result = await getItemsByIds(missingIds);
          const missingItems = result.items;
          const missingMap = new Map(missingItems.map(item => [item.id, item]));
          const allNewItems = newOrder
            .map(id => itemsMap.get(id) || missingMap.get(id))
            .filter(item => item !== undefined);
          setItems(allNewItems);
        } catch (error) {
          console.error('Error loading missing items:', error);
        }
      } else {
        setItems(newItems);
      }

      setUpdating(true);
      try {
        await updateSelection(newSelection.selectedIds, newOrder);
      } catch (error) {
        console.error('Error updating selection:', error);
        loadSelection();
      } finally {
        setUpdating(false);
      }
    }
  };

  // Подгрузка элементов при скролле
  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;

    if (isNearBottom && selection.order.length > items.length) {
      loadItemsData(selection.order, true);
    }
  }, [selection.order, items.length, loadItemsData]);

  const displayItems = filterId
    ? items.filter(item => item.id.toString().includes(filterId.toString()))
    : items;

  const sortableItems = selection.order;

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%',
      padding: '20px'
    }}>
      <h2>Выбранные элементы ({selection.selectedIds.length})</h2>
      
      {/* Фильтр */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Фильтр по ID"
          value={filterId}
          onChange={(e) => setFilterId(e.target.value.trim())}
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

      {updating && (
        <div style={{ 
          padding: '5px', 
          fontSize: '12px', 
          color: '#666',
          marginBottom: '10px'
        }}>
          Обновление...
        </div>
      )}

      {displayItems.length === 0 ? (
        <div style={{ color: '#666', marginTop: '20px' }}>
          {filterId ? 'Элементы не найдены' : 'Нет выбранных элементов'}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortableItems}
            strategy={verticalListSortingStrategy}
          >
            <div 
              style={{ flex: 1, overflow: 'auto', maxHeight: '600px' }}
              onScroll={handleScroll}
            >
              {displayItems.map((item) => (
                <SortableItem key={item.id} id={item.id} item={item} />
              ))}
              {selection.order.length > items.length && (
                <div style={{ padding: '10px', textAlign: 'center', color: '#666' }}>
                  Прокрутите вниз для загрузки
                </div>
              )}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};

export default RightPane;
