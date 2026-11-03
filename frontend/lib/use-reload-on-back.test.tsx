import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useReloadOnBack } from './use-reload-on-back';

describe('useReloadOnBack', () => {
  it('calls the latest reload function when the history goes back', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ reload }) => useReloadOnBack(reload), {
      initialProps: { reload: first },
    });
    rerender({ reload: second });

    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops listening when the screen goes away', () => {
    const reload = vi.fn();
    const { unmount } = renderHook(() => useReloadOnBack(reload));
    unmount();

    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(reload).not.toHaveBeenCalled();
  });
});
