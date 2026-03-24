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

  it('should NOT dismiss when a non-matching key is pressed (popup persists)', () => {
    const onDismiss = vi.fn();
    render(<WhichKeyPopup {...defaultProps} zone="content" onDismiss={onDismiss} />);

    // Press 'z' which is not an action — popup should NOT dismiss
    fireEvent.keyDown(document, { key: 'z' });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('should NOT dismiss when a valid action key is pressed (popup persists, key propagates)', () => {
    const onDismiss = vi.fn();
    render(<WhichKeyPopup {...defaultProps} zone="content" onDismiss={onDismiss} />);

    // Press 'j' which is card-down in content zone — popup should NOT dismiss, key propagates
    fireEvent.keyDown(document, { key: 'j' });
    expect(onDismiss).not.toHaveBeenCalled();
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

  // --- Nested leader group tests ---

  it('should show leader groups as category items for dialog-sidebar zone', () => {
    render(<WhichKeyPopup zone="dialog-sidebar" onDismiss={vi.fn()} />);
    const popup = screen.getByTestId('which-key-popup');
    // Should show Agent and Git/PR groups
    expect(screen.getByTestId('which-key-group-a')).toBeTruthy();
    expect(screen.getByTestId('which-key-group-g')).toBeTruthy();
    expect(popup.textContent).toContain('Agent');
    expect(popup.textContent).toContain('Git/PR');
  });

  it('should show direct actions alongside groups at level 1', () => {
    render(<WhichKeyPopup zone="dialog-sidebar" onDismiss={vi.fn()} />);
    // Direct actions like d (Delete), l (Log toggle), V (Verified), 1/2/3 should be shown
    expect(screen.getByTestId('which-key-item-item-delete-sidebar')).toBeTruthy();
    expect(screen.getByTestId('which-key-item-log-toggle-sidebar')).toBeTruthy();
  });

  it('should drill into sub-actions when onSelectGroup is called', () => {
    const onSelectGroup = vi.fn();
    const { rerender } = render(
      <WhichKeyPopup zone="dialog-sidebar" onDismiss={vi.fn()} leaderGroupKey={null} onSelectGroup={onSelectGroup} />
    );

    // At level 1, groups should be visible
    expect(screen.getByTestId('which-key-group-a')).toBeTruthy();

    // Rerender with leaderGroupKey='a' to simulate drill-down
    rerender(
      <WhichKeyPopup zone="dialog-sidebar" onDismiss={vi.fn()} leaderGroupKey="a" onSelectGroup={onSelectGroup} />
    );

    // Should now show agent sub-actions
    expect(screen.getByTestId('which-key-item-agent-plan-sidebar')).toBeTruthy();
    expect(screen.getByTestId('which-key-item-agent-code-sidebar')).toBeTruthy();
    expect(screen.getByTestId('which-key-item-agent-stop-sidebar')).toBeTruthy();
    // Group items should NOT be visible at level 2
    expect(screen.queryByTestId('which-key-group-a')).toBeNull();
  });

  it('should show breadcrumb header at level 2', () => {
    render(
      <WhichKeyPopup zone="dialog-sidebar" onDismiss={vi.fn()} leaderGroupKey="a" onSelectGroup={vi.fn()} />
    );
    const breadcrumb = screen.getByTestId('which-key-breadcrumb');
    expect(breadcrumb.textContent).toContain('Leader');
    expect(breadcrumb.textContent).toContain('Agent');
  });

  it('should return to level 1 when Backspace is pressed at level 2', () => {
    const onSelectGroup = vi.fn();
    render(
      <WhichKeyPopup zone="dialog-sidebar" onDismiss={vi.fn()} leaderGroupKey="a" onSelectGroup={onSelectGroup} />
    );

    fireEvent.keyDown(document, { key: 'Backspace' });
    expect(onSelectGroup).toHaveBeenCalledWith(null);
  });

  it('should dismiss entirely on Escape at level 2', () => {
    const onDismiss = vi.fn();
    render(
      <WhichKeyPopup zone="dialog-sidebar" onDismiss={onDismiss} leaderGroupKey="a" onSelectGroup={vi.fn()} />
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // --- Group key navigation tests (bug fix) ---

  it('should call onSelectGroup instead of onDismiss when a group key is pressed at level 1 (dialog-sidebar zone)', () => {
    const onDismiss = vi.fn();
    const onSelectGroup = vi.fn();
    render(
      <WhichKeyPopup zone="dialog-sidebar" onDismiss={onDismiss} leaderGroupKey={null} onSelectGroup={onSelectGroup} />
    );

    // Press 'a' which is the Agent group key
    fireEvent.keyDown(document, { key: 'a' });
    expect(onSelectGroup).toHaveBeenCalledWith('a');
    expect(onDismiss).not.toHaveBeenCalled();

    onSelectGroup.mockClear();
    onDismiss.mockClear();

    // Press 'g' which is the Git/PR group key
    fireEvent.keyDown(document, { key: 'g' });
    expect(onSelectGroup).toHaveBeenCalledWith('g');
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('should NOT dismiss for non-group keys at level 1 in dialog-sidebar zone (popup persists)', () => {
    const onDismiss = vi.fn();
    const onSelectGroup = vi.fn();
    render(
      <WhichKeyPopup zone="dialog-sidebar" onDismiss={onDismiss} leaderGroupKey={null} onSelectGroup={onSelectGroup} />
    );

    // Press 'z' which is not a group key or direct action — popup persists
    fireEvent.keyDown(document, { key: 'z' });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onSelectGroup).not.toHaveBeenCalled();
  });

  it('should NOT dismiss for action keys at level 2 (key propagates to zone handlers)', () => {
    const onDismiss = vi.fn();
    const onSelectGroup = vi.fn();
    render(
      <WhichKeyPopup zone="dialog-sidebar" onDismiss={onDismiss} leaderGroupKey="a" onSelectGroup={onSelectGroup} />
    );

    // At level 2 (inside Agent group), pressing 'c' (code agent) — popup ignores,
    // key propagates to zone handler which calls vim.clearLeader()
    fireEvent.keyDown(document, { key: 'c' });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onSelectGroup).not.toHaveBeenCalled();
  });

  it('should not call onSelectGroup for keys that are not valid group keys', () => {
    const onDismiss = vi.fn();
    const onSelectGroup = vi.fn();
    render(
      <WhichKeyPopup zone="dialog-sidebar" onDismiss={onDismiss} leaderGroupKey={null} onSelectGroup={onSelectGroup} />
    );

    // 'x' is not a group key (a, g are the only groups) — popup persists
    fireEvent.keyDown(document, { key: 'x' });
    expect(onSelectGroup).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('should not show group items for non-dialog zones (content stays flat)', () => {
    render(<WhichKeyPopup zone="content" onDismiss={vi.fn()} />);
    // Content zone should not have any group items
    expect(screen.queryByTestId('which-key-group-a')).toBeNull();
    expect(screen.queryByTestId('which-key-group-g')).toBeNull();
    // But should have flat action items
    expect(screen.getByTestId('which-key-item-card-down')).toBeTruthy();
  });
});
