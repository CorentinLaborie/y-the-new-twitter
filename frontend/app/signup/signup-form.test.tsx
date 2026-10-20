import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signup } from '@/lib/auth-api';
import { takePendingEmail } from '@/lib/pending-email';
import { SignupForm } from './signup-form';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('@/lib/auth-api', () => ({ signup: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

function fillValidForm() {
  fireEvent.change(screen.getByLabelText('Nom affiché (obligatoire)'), {
    target: { value: 'Jeannot Dupont' },
  });
  fireEvent.change(screen.getByLabelText('Identifiant'), { target: { value: 'Jeannot45' } });
  fireEvent.change(screen.getByLabelText('Date de naissance'), { target: { value: '01/02/1990' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: '  Jeannot@Exemple.fr ' } });
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'Secret-42!' } });
  fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: 'Secret-42!' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /J’accepte les Conditions d’utilisation/ }));
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
}

describe('SignupForm', () => {
  beforeEach(() => {
    vi.mocked(signup).mockReset();
    push.mockReset();
  });

  it('shows the French errors, focuses the first invalid field and does not call the API', async () => {
    render(<SignupForm />);

    submit();

    expect(await screen.findByText('Le nom affiché est obligatoire.')).toBeInTheDocument();
    expect(screen.getByText('Le pseudo est obligatoire.')).toBeInTheDocument();
    expect(screen.getByText('Confirmez votre mot de passe.')).toBeInTheDocument();
    expect(screen.getByText('Vous devez accepter les conditions d’utilisation.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nom affiché (obligatoire)')).toHaveFocus();
    expect(signup).not.toHaveBeenCalled();
  });

  it('sends the normalised values and goes to the code page, handing the e-mail over outside the URL', async () => {
    vi.mocked(signup).mockResolvedValue({ ok: true, status: 202, body: {} });
    render(<SignupForm />);

    fillValidForm();
    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/signup/code'));
    expect(takePendingEmail()).toBe('jeannot@exemple.fr');
    expect(signup).toHaveBeenCalledWith({
      handle: 'Jeannot45',
      displayName: 'Jeannot Dupont',
      email: 'jeannot@exemple.fr',
      password: 'Secret-42!',
      birthDate: '1990-02-01',
      termsAccepted: true,
      termsVersion: '1.0',
    });
  });

  it('puts a taken handle under the handle field', async () => {
    vi.mocked(signup).mockResolvedValue({
      ok: false,
      problem: { status: 409, title: 'Conflict', detail: 'Handle already used.' },
    });
    render(<SignupForm />);

    fillValidForm();
    submit();

    expect(await screen.findByText('Cet identifiant existe déjà.')).toBeInTheDocument();
    expect(screen.getByLabelText('Identifiant')).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
  });

  it('shows the wait given by Retry-After when there are too many attempts', async () => {
    vi.mocked(signup).mockResolvedValue({
      ok: false,
      problem: { status: 429, title: 'Too Many Requests', detail: 'Slow down.', retryAfterSeconds: 120 },
    });
    render(<SignupForm />);

    fillValidForm();
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Trop de tentatives. Réessayez dans 2 minutes.',
    );
    expect(screen.getByRole('button', { name: 'Créer mon compte' })).toBeEnabled();
  });
});
