import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReport } from '@/lib/reports-api';
import { ReportDialog } from './report-dialog';

vi.mock('@/lib/reports-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/reports-api')>();
  return { ...actual, createReport: vi.fn() };
});

// jsdom does not implement the modal methods of <dialog>: the open state is kept on the attribute.
beforeAll(() => {
  if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
  }
  if (typeof HTMLDialogElement.prototype.close !== 'function') {
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
  }
});

const RECEIPT = { id: 'r-1', status: 'open' as const, createdAt: '2026-10-23T10:00:00.000Z' };

function renderDialog(props: Partial<Parameters<typeof ReportDialog>[0]> = {}) {
  const onClose = vi.fn();
  const onSent = vi.fn();
  render(
    <ReportDialog
      open
      kind="question"
      target={{ questionId: 'q-42' }}
      onClose={onClose}
      onSent={onSent}
      {...props}
    />,
  );
  return { onClose, onSent };
}

function signalButton() {
  return screen.getByRole('button', { name: 'Signaler' });
}

beforeEach(() => {
  vi.mocked(createReport).mockReset();
});

describe('ReportDialog', () => {
  it('is not shown while closed', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('names the question or the reply it reports', () => {
    const { unmount } = render(
      <ReportDialog open kind="question" target={{ questionId: 'q-42' }} onClose={vi.fn()} onSent={vi.fn()} />,
    );
    expect(screen.getByRole('dialog', { name: 'Signaler cette question' })).toBeInTheDocument();
    unmount();

    renderDialog({ kind: 'reply', target: { replyId: 'r-9' } });
    expect(screen.getByRole('dialog', { name: 'Signaler cette réponse' })).toBeInTheDocument();
  });

  it('offers the six reasons, with Propos haineux for hate, and keeps Signaler off until one is chosen', () => {
    renderDialog();

    for (const label of ['Spam', 'Harcèlement', 'Propos haineux', 'Contenu illicite', 'Désinformation', 'Autre']) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }
    expect(signalButton()).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Spam' }));

    expect(signalButton()).toBeEnabled();
  });

  it('requires details for Autre, and shows the counter and the hint until they are given', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Autre' }));

    expect(screen.getByText('Précisez le motif pour continuer.')).toBeInTheDocument();
    expect(signalButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Précisez le motif/), { target: { value: 'Motif' } });

    expect(screen.getByText('5 / 280')).toBeInTheDocument();
    expect(signalButton()).toBeEnabled();
  });

  it('keeps Signaler off when Autre details are over 280 characters', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Autre' }));

    fireEvent.change(screen.getByLabelText(/Précisez le motif/), { target: { value: 'a'.repeat(281) } });

    expect(signalButton()).toBeDisabled();
  });

  it('sends the report once, with a key, and reports success to the parent', async () => {
    vi.mocked(createReport).mockResolvedValue({ ok: true, status: 201, body: RECEIPT });
    const { onSent } = renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Spam' }));

    fireEvent.click(signalButton());

    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(createReport).toHaveBeenCalledTimes(1);
    const [target, reason, details, key] = vi.mocked(createReport).mock.calls[0]!;
    expect(target).toEqual({ questionId: 'q-42' });
    expect(reason).toBe('spam');
    expect(details).toBeUndefined();
    expect(typeof key).toBe('string');
  });

  it('shows the unavailable message and Fermer on a 404, and closes with Fermer', async () => {
    vi.mocked(createReport).mockResolvedValue({
      ok: false,
      problem: { status: 404, title: 'Introuvable', detail: 'Contenu introuvable.' },
    });
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Spam' }));

    fireEvent.click(signalButton());

    expect(await screen.findByText('Ce contenu n’est plus disponible.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Signaler' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the choice and shows the failure message on a server error, so the user can retry', async () => {
    vi.mocked(createReport).mockResolvedValue({
      ok: false,
      problem: { status: 500, title: 'Erreur', detail: 'Erreur.' },
    });
    renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Spam' }));

    fireEvent.click(signalButton());

    expect(await screen.findByText('Le signalement n’a pas pu être envoyé. Réessayez.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Spam' })).toBeChecked();
    expect(signalButton()).toBeEnabled();
  });

  it('closes on Annuler without sending anything', () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Spam' }));

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(createReport).not.toHaveBeenCalled();
  });
});
