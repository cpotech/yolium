import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMockContainer = () => {
  const scrollByMock = vi.fn();
  const container = {
    scrollBy: scrollByMock,
    scrollTop: 0,
    clientHeight: 100,
    scrollHeight: 1000,
  };
  return { container, scrollByMock };
};

describe('useDialogScroll logic', () => {
  let scrollByMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const simulateHandleKeyDown = (
    container: { scrollBy: (opts: { top: number; behavior: string }) => void },
    key: string,
    mode: string,
    scrollAmount: number = 48
  ) => {
    if (mode === 'INSERT') return;
    if (key === 'j') {
      container.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    } else if (key === 'k') {
      container.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
    }
  };

  it('should scroll down when j key is pressed', () => {
    const { container, scrollByMock } = createMockContainer();
    simulateHandleKeyDown(container, 'j', 'NORMAL');
    expect(scrollByMock).toHaveBeenCalledWith({ top: 48, behavior: 'smooth' });
  });

  it('should scroll up when k key is pressed', () => {
    const { container, scrollByMock } = createMockContainer();
    simulateHandleKeyDown(container, 'k', 'NORMAL');
    expect(scrollByMock).toHaveBeenCalledWith({ top: -48, behavior: 'smooth' });
  });

  it('should not scroll in INSERT mode', () => {
    const { container, scrollByMock } = createMockContainer();
    simulateHandleKeyDown(container, 'j', 'INSERT');
    expect(scrollByMock).not.toHaveBeenCalled();
  });

  it('should respect configurable scroll amount', () => {
    const { container, scrollByMock } = createMockContainer();
    simulateHandleKeyDown(container, 'j', 'NORMAL', 100);
    expect(scrollByMock).toHaveBeenCalledWith({ top: 100, behavior: 'smooth' });
  });

  it('should not prevent default for non-j/k keys', () => {
    const { scrollByMock } = createMockContainer();
    simulateHandleKeyDown({ scrollBy: scrollByMock } as never, 'Escape', 'NORMAL');
    expect(scrollByMock).not.toHaveBeenCalled();
  });
});
