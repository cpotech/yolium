import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Tab } from './Tab';
import type { Tab as TabType } from '@shared/types/tabs';
import { useVimModeContext } from '@renderer/context/VimModeContext';

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
  const vim = useVimModeContext();
  const isZoneActive = vim.activeZone === 'tabs' && vim.mode === 'NORMAL';
  const [focusedTabIndex, setFocusedTabIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus container when zone becomes active
  useEffect(() => {
    if (isZoneActive && containerRef.current) {
      const active = document.activeElement;
      const tag = active?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      containerRef.current.focus();
    }
  }, [isZoneActive]);

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

  // Keep focusedTabIndex in bounds when tabs change
  useEffect(() => {
    if (focusedTabIndex >= tabs.length && tabs.length > 0) {
      setFocusedTabIndex(tabs.length - 1);
    }
  }, [tabs.length, focusedTabIndex]);

  const handleVimKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isZoneActive || tabs.length === 0) return;

    if (e.key === 'l' || e.key === 'ArrowRight') {
      e.preventDefault();
      setFocusedTabIndex(prev => Math.min(prev + 1, tabs.length - 1));
    } else if (e.key === 'h' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setFocusedTabIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusedTabIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocusedTabIndex(tabs.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = Math.min(focusedTabIndex, tabs.length - 1);
      onTabClick(tabs[idx].id);
      vim.setActiveZone('content');
    } else if (e.key === 'x') {
      e.preventDefault();
      const idx = Math.min(focusedTabIndex, tabs.length - 1);
      onTabClose(tabs[idx].id);
    } else if (e.key === '+') {
      e.preventDefault();
      onNewTab();
    }
  }, [isZoneActive, tabs, focusedTabIndex, onTabClick, onTabClose, onNewTab]);

  return (
    <div
      ref={containerRef}
      data-testid="tab-bar"
      data-vim-zone="tabs"
      tabIndex={isZoneActive ? 0 : undefined}
      onKeyDown={handleVimKeyDown}
      className={`flex items-center h-9 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-primary)] shrink-0 ${
        isZoneActive ? 'ring-1 ring-[var(--color-accent-primary)]' : ''
      }`}
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
        {tabs.map((tab, index) => (
          <Tab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            isVimFocused={isZoneActive && index === focusedTabIndex}
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
        data-vim-key="+"
        onClick={onNewTab}
        className="flex items-center gap-1 px-3 h-full hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] border-l border-[var(--color-border-primary)]"
        aria-label="New Yolium"
      >
        <Plus size={16} />
        <kbd className="px-1 py-0.5 text-[10px] bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border-primary)] font-mono">+</kbd>
      </button>
    </div>
  );
}
