import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNotificationPreferences, type NotificationPreferenceType, setNotificationPreference } from '@/lib/settings-api';
import { NotificationSettings } from './notification-settings';

vi.mock('@/lib/settings-api', () => ({
  getNotificationPreferences: vi.fn(),
  setNotificationPreference: vi.fn(),
}));

const OK = (type: NotificationPreferenceType, enabled: boolean) => ({ ok: true as const, status: 200, body: { type, enabled } });

function switchOf(label: string) {
  return within(screen.getByText(label).closest('li') as HTMLElement).getByRole('switch');
}

beforeEach(() => {
  vi.mocked(getNotificationPreferences).mockReset();
  vi.mocked(setNotificationPreference).mockReset();
});

describe('NotificationSettings', () => {
  it('shows the five rows, on by default, and the stored value of a row', async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [{ type: 'follow', enabled: false }] },
    });

    render(<NotificationSettings />);

    expect(await screen.findByText('Nouveaux abonnés')).toBeInTheDocument();
    expect(switchOf('Nouveaux abonnés')).toHaveAttribute('aria-checked', 'false');
    expect(switchOf('Mentions')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByRole('switch')).toHaveLength(5);
  });

  it('switches a row at once, sends the new value, and announces it', async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue({ ok: true, status: 200, body: { items: [] } });
    vi.mocked(setNotificationPreference).mockResolvedValue(OK('mention', false));
    render(<NotificationSettings />);
    await screen.findByText('Mentions');

    fireEvent.click(switchOf('Mentions'));

    expect(await screen.findByRole('status')).toHaveTextContent('Préférence enregistrée.');
    expect(setNotificationPreference).toHaveBeenCalledWith('mention', false);
    expect(switchOf('Mentions')).toHaveAttribute('aria-checked', 'false');
  });

  it('keeps the previous value and shows an alert when the change fails', async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue({ ok: true, status: 200, body: { items: [] } });
    vi.mocked(setNotificationPreference).mockResolvedValue({
      ok: false,
      problem: { status: 500, title: 'Erreur', detail: 'Erreur.' },
    });
    render(<NotificationSettings />);
    await screen.findByText('Mentions');

    fireEvent.click(switchOf('Mentions'));

    expect(await screen.findByRole('alert')).toHaveTextContent('La préférence n’a pas pu être enregistrée. Réessayez.');
    expect(switchOf('Mentions')).toHaveAttribute('aria-checked', 'true');
  });

  it('switches the three reaction kinds together, with one change each', async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue({ ok: true, status: 200, body: { items: [] } });
    vi.mocked(setNotificationPreference).mockImplementation(async (type, enabled) => OK(type, enabled));
    render(<NotificationSettings />);
    await screen.findByText('Réactions (J’aime, Pas d’accord, Y)');

    fireEvent.click(switchOf('Réactions (J’aime, Pas d’accord, Y)'));

    await waitFor(() => expect(setNotificationPreference).toHaveBeenCalledTimes(3));
    expect(vi.mocked(setNotificationPreference).mock.calls.map((call) => call[0])).toEqual([
      'reaction_like',
      'reaction_dislike',
      'reaction_y',
    ]);
    expect(vi.mocked(setNotificationPreference).mock.calls.every((call) => call[1] === false)).toBe(true);
  });

  it('disables the switch while its change is sent', async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue({ ok: true, status: 200, body: { items: [] } });
    let finish: (value: ReturnType<typeof OK>) => void = () => undefined;
    vi.mocked(setNotificationPreference).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<NotificationSettings />);
    await screen.findByText('Mentions');

    fireEvent.click(switchOf('Mentions'));

    await waitFor(() => expect(switchOf('Mentions')).toBeDisabled());
    expect(switchOf('Mentions')).toHaveAttribute('aria-busy', 'true');
    finish(OK('mention', false));
    expect(await screen.findByRole('status')).toHaveTextContent('Préférence enregistrée.');
  });

  it('shows the read error with Réessayer, and loads the preferences again on it', async () => {
    vi.mocked(getNotificationPreferences)
      .mockResolvedValueOnce({ ok: false, problem: { status: 500, title: 'Erreur', detail: 'Erreur.' } })
      .mockResolvedValueOnce({ ok: true, status: 200, body: { items: [] } });

    render(<NotificationSettings />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Vos préférences n’ont pas pu être chargées.');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Mentions')).toBeInTheDocument();
  });
});
