import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchUnreadCount } from '@/lib/notifications-api';
import { useUnreadCount } from './use-unread-count';

vi.mock('@/lib/notifications-api', () => ({
  fetchUnreadCount: vi.fn(),
  NOTIFICATIONS_READ_EVENT: 'y:notifications-read',
}));

function answer(unread: number) {
  vi.mocked(fetchUnreadCount).mockResolvedValueOnce({ ok: true, status: 200, body: { unread } });
}

describe('useUnreadCount (badge, L2 section 6.4)', () => {
  beforeEach(() => {
    vi.mocked(fetchUnreadCount).mockReset();
  });

  it('starts at 0 and takes the count of the API', async () => {
    answer(3);
    const { result } = renderHook(() => useUnreadCount('/home'));

    expect(result.current).toBe(0);
    await waitFor(() => expect(result.current).toBe(3));
  });

  it('reads the count again on every page change', async () => {
    answer(3);
    answer(0);
    const { result, rerender } = renderHook(({ path }) => useUnreadCount(path), {
      initialProps: { path: '/home' },
    });
    await waitFor(() => expect(result.current).toBe(3));

    rerender({ path: '/notifications' });

    await waitFor(() => expect(result.current).toBe(0));
    expect(fetchUnreadCount).toHaveBeenCalledTimes(2);
  });

  it('keeps the last known count when the call fails', async () => {
    answer(5);
    vi.mocked(fetchUnreadCount).mockResolvedValueOnce({
      ok: false,
      problem: { status: 500, title: 'Erreur', detail: 'indisponible' } as never,
    });
    const { result, rerender } = renderHook(({ path }) => useUnreadCount(path), {
      initialProps: { path: '/home' },
    });
    await waitFor(() => expect(result.current).toBe(5));

    rerender({ path: '/messages' });

    await waitFor(() => expect(fetchUnreadCount).toHaveBeenCalledTimes(2));
    expect(result.current).toBe(5);
  });

  it('resets to 0 at once when every line is marked as read, without a page change', async () => {
    answer(4);
    const { result } = renderHook(() => useUnreadCount('/notifications'));
    await waitFor(() => expect(result.current).toBe(4));

    act(() => {
      window.dispatchEvent(new Event('y:notifications-read'));
    });

    expect(result.current).toBe(0);
    expect(fetchUnreadCount).toHaveBeenCalledTimes(1);
  });
});
