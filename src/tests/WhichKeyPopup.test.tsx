/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { WhichKeyPopup } from '@renderer/components/WhichKeyPopup';
import type { VimActionZone } from '@shared/vim-actions';

describe('WhichKeyPopup', () => {
  const defaultProps = {
    zone: 'content' as VimActionZone,
    onDismiss: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should render actions for the given zone', () => {
    render(<WhichKeyPopup {...defaultProps} zone="content" />);
    // Content zone has actions like j (Next card), k (Previous card), etc.
    expect(screen.getByTestId('which-key-popup')).toBeTruthy();
    // Should have at least one action rendered
    const keys = screen.getAllByTestId(/^which-key-item-/);
    expect(keys.length).toBeGreaterThan(0);
  });

  it('should filter to vim category NORMAL mode actions only', () => {
    render(<WhichKeyPopup {...defaultProps} zone="content" />);
    // Content zone should show vim/NORMAL actions but not electron or mouse actions
    const popup = screen.getByTestId('which-key-popup');
    // The Ctrl+A action is NORMAL mode but not single-key, should still show
    // Mouse actions (Ctrl+Click) should not appear since they are mouse category
    expect(popup.textContent).not.toContain('Ctrl+Click');
  });

  it('should dismiss and let key propagate when a valid action key is pressed', () => {
    const onDismiss = vi.fn();
    render(<WhichKeyPopup {...defaultProps} zone="content" onDismiss={onDismiss} />);

    // Press 'j' which is card-down in content zone — popup dismisses, key propagates
    fireEvent.keyDown(document, { key: 'j' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('should call onDismiss when Escape is pressed', () => {
    const onDismiss = vi.fn();
    render(<WhichKeyPopup {...defaultProps} onDismiss={onDismiss} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('should call onDismiss when Ctrl+Q is pressed', () => {
    const onDismiss = vi.fn();
    render(<WhichKeyPopup {...defaultProps} onDismiss={onDismiss} />);

    fireEvent.keyDown(document, { key: 'q', ctrlKey: true });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('should call onDismiss on click outside', () => {
    const onDismiss = vi.fn();
    render(<WhichKeyPopup {...defaultProps} onDismiss={onDismiss} />);

    // Click on the backdrop
    fireEvent.mouseDown(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('should display key and description for each action', () => {
    render(<WhichKeyPopup {...defaultProps} zone="content" />);

    // Content zone should show 'j' with 'Next card' description
    const popup = screen.getByTestId('which-key-popup');
    expect(popup.textContent).toContain('j');
    expect(popup.textContent).toContain('Next card');
  });

  it('should not render actions from other zones', () => {
    render(<WhichKeyPopup {...defaultProps} zone="content" />);

    // Sidebar actions like 'a' (Open project) should not appear in content zone
    const popup = screen.getByTestId('which-key-popup');
    // 'Open project' is a sidebar action, not content
    expect(popup.textContent).not.toContain('Open project');
  });
});
