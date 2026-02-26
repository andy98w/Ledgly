'use client';

import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react';

interface AnimatedListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  getKey: (item: T) => string;
}

type ItemState = 'enter' | 'stable' | 'exit';

interface TrackedItem<T> {
  item: T;
  key: string;
  state: ItemState;
}

export function AnimatedList<T>({
  items,
  renderItem,
  className,
  getKey,
}: AnimatedListProps<T>) {
  const prevItemsRef = useRef<Map<string, T>>(new Map());
  const isFirstRender = useRef(true);
  const [trackedItems, setTrackedItems] = useState<TrackedItem<T>[]>(() =>
    items.map((item) => ({ item, key: getKey(item), state: 'stable' as ItemState })),
  );

  useEffect(() => {
    const prevMap = prevItemsRef.current;
    const currentKeys = new Set(items.map(getKey));
    const currentMap = new Map(items.map((item) => [getKey(item), item]));

    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevItemsRef.current = currentMap;
      setTrackedItems(items.map((item) => ({ item, key: getKey(item), state: 'stable' })));
      return;
    }

    // Check if this is a wholesale swap (pagination/filter change) — skip animation
    // Heuristic: if more than 60% of keys changed, treat as a page swap
    const prevKeys = new Set(Array.from(prevMap.keys()));
    const keptKeys = items.filter((item) => prevKeys.has(getKey(item)));
    const isPageSwap = prevKeys.size > 0 && keptKeys.length < prevKeys.size * 0.4 && items.length > 2;

    if (isPageSwap) {
      prevItemsRef.current = currentMap;
      setTrackedItems(items.map((item) => ({ item, key: getKey(item), state: 'stable' })));
      return;
    }

    // Build merged list: current items in order, with exiting items interleaved
    const merged: TrackedItem<T>[] = [];

    // Find removed keys (in prev but not in current)
    const prevOrder = Array.from(prevMap.keys());
    const removedKeys = new Set<string>();
    for (const key of prevOrder) {
      if (!currentKeys.has(key)) {
        removedKeys.add(key);
      }
    }

    // Insert current items, slotting in exiting items before them based on previous order
    const insertedCurrent = new Set<string>();
    const insertedExiting = new Set<string>();

    // Walk through prev order, emitting exits and current items in stable order
    for (const prevKey of prevOrder) {
      if (removedKeys.has(prevKey) && !insertedExiting.has(prevKey)) {
        merged.push({
          item: prevMap.get(prevKey)!,
          key: prevKey,
          state: 'exit',
        });
        insertedExiting.add(prevKey);
      } else if (currentKeys.has(prevKey) && !insertedCurrent.has(prevKey)) {
        // Emit this item and any new items that precede it in the current list
        for (let i = 0; i < items.length; i++) {
          const k = getKey(items[i]);
          if (insertedCurrent.has(k)) continue;
          if (k === prevKey) {
            merged.push({
              item: items[i],
              key: k,
              state: prevMap.has(k) ? 'stable' : 'enter',
            });
            insertedCurrent.add(k);
            break;
          }
          if (!prevMap.has(k)) {
            merged.push({
              item: items[i],
              key: k,
              state: 'enter',
            });
            insertedCurrent.add(k);
          }
        }
      }
    }

    // Append any current items not yet inserted (new items at the end)
    for (const item of items) {
      const k = getKey(item);
      if (!insertedCurrent.has(k)) {
        merged.push({
          item,
          key: k,
          state: prevMap.has(k) ? 'stable' : 'enter',
        });
        insertedCurrent.add(k);
      }
    }

    prevItemsRef.current = currentMap;
    setTrackedItems(merged);
  }, [items, getKey]);

  const handleExitEnd = useCallback((key: string) => {
    setTrackedItems((prev) => prev.filter((t) => t.key !== key));
  }, []);

  const handleEnterEnd = useCallback((key: string) => {
    setTrackedItems((prev) =>
      prev.map((t) => (t.key === key ? { ...t, state: 'stable' } : t)),
    );
  }, []);

  return (
    <div className={className}>
      {trackedItems.map((tracked, index) => (
        <div
          key={tracked.key}
          className={
            tracked.state === 'enter'
              ? 'list-item-enter'
              : tracked.state === 'exit'
                ? 'list-item-exit'
                : undefined
          }
          onAnimationEnd={
            tracked.state === 'exit'
              ? () => handleExitEnd(tracked.key)
              : tracked.state === 'enter'
                ? () => handleEnterEnd(tracked.key)
                : undefined
          }
        >
          {renderItem(tracked.item, tracked.state === 'exit' ? -1 : index)}
        </div>
      ))}
    </div>
  );
}
