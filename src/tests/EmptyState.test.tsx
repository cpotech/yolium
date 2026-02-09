/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '@renderer/components/EmptyState';
import { ThemeProvider } from '@renderer/theme';
import type { SidebarProject } from '@renderer/stores/sidebar-store';

// Wrap component with ThemeProvider for tests
function renderEmptyState(props: {
  onNewTab: () => void;
  onCreateProject?: () => void;
  projects?: SidebarProject[];
  onProjectClick?: (path: string) => void;
}) {
  return render(
    <ThemeProvider>
      <EmptyState {...props} />
    </ThemeProvider>
  );
}

describe('EmptyState', () => {
  it('should render the New Terminal button', () => {
    renderEmptyState({ onNewTab: vi.fn() });
    expect(screen.getByText('New Terminal')).toBeInTheDocument();
  });

  it('should call onNewTab when New Terminal button is clicked', () => {
    const onNewTab = vi.fn();
    renderEmptyState({ onNewTab });

    fireEvent.click(screen.getByText('New Terminal'));
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

  it('should render getting started steps when no projects exist', () => {
    renderEmptyState({ onNewTab: vi.fn(), onCreateProject: vi.fn() });
    expect(screen.getByText('Get started')).toBeInTheDocument();
  });

  it('should render recent projects when projects are provided', () => {
    const projects: SidebarProject[] = [
      { path: '/home/user/my-app', addedAt: '2025-01-01T00:00:00Z' },
      { path: '/home/user/backend', addedAt: '2025-01-02T00:00:00Z' },
    ];
    const onProjectClick = vi.fn();

    renderEmptyState({ onNewTab: vi.fn(), onCreateProject: vi.fn(), projects, onProjectClick });

    expect(screen.getByText('Recent Projects')).toBeInTheDocument();
    expect(screen.getByText('my-app')).toBeInTheDocument();
    expect(screen.getByText('backend')).toBeInTheDocument();
    expect(screen.queryByText('Get started')).not.toBeInTheDocument();
  });

  it('should call onProjectClick when a recent project is clicked', () => {
    const projects: SidebarProject[] = [
      { path: '/home/user/my-app', addedAt: '2025-01-01T00:00:00Z' },
    ];
    const onProjectClick = vi.fn();

    renderEmptyState({ onNewTab: vi.fn(), projects, onProjectClick });

    fireEvent.click(screen.getByText('my-app'));
    expect(onProjectClick).toHaveBeenCalledWith('/home/user/my-app');
  });
});
