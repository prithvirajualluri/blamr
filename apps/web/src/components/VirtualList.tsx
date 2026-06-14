import React, { useCallback, useEffect, useRef, useState } from 'react';

interface VirtualListProps<T> {
  items: T[];
  rowHeight: number;
  height: number;
  rowKey: (item: T) => string;
  renderRow: (item: T) => React.ReactNode;
  overscan?: number;
  className?: string;
}

export function VirtualList<T>({
  items,
  rowHeight,
  height,
  rowKey,
  renderRow,
  overscan = 6,
  className,
}: VirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const onScroll = useCallback(() => {
    setScrollTop(scrollRef.current?.scrollTop ?? 0);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  const totalHeight = items.length * rowHeight;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visible = Math.ceil(height / rowHeight) + overscan * 2;
  const end = Math.min(items.length, start + visible);
  const slice = items.slice(start, end);

  return (
    <div ref={scrollRef} className={`virtual-list${className ? ` ${className}` : ''}`} style={{ height, overflow: 'auto' }}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        {slice.map((item, i) => {
          const index = start + i;
          const key = rowKey(item);
          return (
            <div
              key={key}
              className="virtual-list-row"
              style={{ position: 'absolute', top: index * rowHeight, left: 0, right: 0, height: rowHeight }}
            >
              {renderRow(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
