import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Tab } from './Tab';
import type { Tab as TabType } from '@shared/types/tabs';

interface TabBarProps {
  tabs: TabType[];
  activeTabId: string | null;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabContextMenu: (id: string, x: number, y: number) => void;
  onNewTab: () => void;
}

export function TabBar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabContextMenu,
  onNewTab,
}: TabBarProps): React.ReactElement {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  const updateArrowVisibility = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const hasOverflow = container.scrollWidth > container.clientWidth;
    setShowLeftArrow(hasOverflow && container.scrollLeft > 0);
    setShowRightArrow(
      hasOverflow && container.scrollLeft < container.scrollWidth - container.clientWidth - 1
    );
  }, []);

  useEffect(() => {
    updateArrowVisibility();
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', updateArrowVisibility);
    // Also update on resize
    const resizeObserver = new ResizeObserver(updateArrowVisibility);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', updateArrowVisibility);
      resizeObserver.disconnect();
    };
  }, [tabs.length, updateArrowVisibility]);

  const scroll = (direction: 'left' | 'right') => {
    scrollContainerRef.current?.scrollBy({
      left: direction === 'left' ? -200 : 200,
      behavior: 'smooth',
    });
  };

  const handleContextMenu = (tab: TabType, e: React.MouseEvent) => {
    e.preventDefault();
    onTabContextMenu(tab.id, e.clientX, e.clientY);
  };

  return (
    <div
      data-testid="tab-bar"
      className="flex items-center h-9 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-primary)] shrink-0"
      role="tablist"
    >
      {/* Left scroll arrow */}
      {showLeftArrow && (
        <button
          onClick={() => scroll('left')}
          className="px-1.5 h-full hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          aria-label="Scroll tabs left"
        >
          <ChevronLeft size={16} />
        </button>
      )}

      {/* Tabs container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 flex overflow-x-hidden"
      >
        {tabs.map(tab => (
          <Tab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onClick={() => onTabClick(tab.id)}
            onClose={() => onTabClose(tab.id)}
            onContextMenu={(e) => handleContextMenu(tab, e)}
          />
        ))}
      </div>

      {/* Right scroll arrow */}
      {showRightArrow && (
        <button
          onClick={() => scroll('right')}
          className="px-1.5 h-full hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          aria-label="Scroll tabs right"
        >
          <ChevronRight size={16} />
        </button>
      )}

      {/* New Yolium button */}
      <button
        data-testid="new-tab-button"
        onClick={onNewTab}
        className="px-3 h-full hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] border-l border-[var(--color-border-primary)]"
        aria-label="New Yolium"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
