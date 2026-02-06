/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '@renderer/components/EmptyState';
import { ThemeProvider } from '@renderer/theme';

// Wrap component with ThemeProvider for tests
function renderEmptyState(props: { onNewTab: () => void; onCreateProject?: () => void }) {
  return render(
    <ThemeProvider>
      <EmptyState {...props} />
    </ThemeProvider>
  );
}

describe('EmptyState', () => {
  it('should render the New Yolium button', () => {
    renderEmptyState({ onNewTab: vi.fn() });
    expect(screen.getByText('New Yolium')).toBeInTheDocument();
  });

  it('should call onNewTab when New Yolium button is clicked', () => {
    const onNewTab = vi.fn();
    renderEmptyState({ onNewTab });

    fireEvent.click(screen.getByText('New Yolium'));
    expect(onNewTab).toHaveBeenCalled();
  });

  it('should render the Create Project button when onCreateProject is provided', () => {
    renderEmptyState({ onNewTab: vi.fn(), onCreateProject: vi.fn() });
    expect(screen.getByText('Create Project')).toBeInTheDocument();
  });

  it('should call onCreateProject when Create Project button is clicked', () => {
    const onCreateProject = vi.fn();
    renderEmptyState({ onNewTab: vi.fn(), onCreateProject });

    fireEvent.click(screen.getByText('Create Project'));
    expect(onCreateProject).toHaveBeenCalled();
  });

  it('should not render Create Project button when onCreateProject is not provided', () => {
    renderEmptyState({ onNewTab: vi.fn() });
    expect(screen.queryByText('Create Project')).not.toBeInTheDocument();
  });

  it('should render both buttons side by side', () => {
    renderEmptyState({ onNewTab: vi.fn(), onCreateProject: vi.fn() });

    const newYoliumBtn = screen.getByText('New Yolium');
    const createProjectBtn = screen.getByText('Create Project');

    // Both should be in the same container (flex gap)
    expect(newYoliumBtn.closest('div')).toBe(createProjectBtn.closest('div'));
  });
});
