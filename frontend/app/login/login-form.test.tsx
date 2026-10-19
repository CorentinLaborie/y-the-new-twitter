import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { login } from '@/lib/auth-api';
import { LoginForm } from './login-form';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('@/lib/auth-api', () => ({ login: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), useSearchParams: vi.fn() }));

function givenUrl(query: string) {
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams(query) as unknown as ReturnType<typeof useSearchParams>,
  );
}

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.mocked(login).mockReset();
    push.mockReset();
    givenUrl('');
  });

  it('checks both fields and focuses the first empty one without calling the API', async () => {
    render(<LoginForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByText('L’adresse e-mail est obligatoire.')).toBeInTheDocument();
    expect(screen.getByText('Le mot de passe est obligatoire.')).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse e-mail')).toHaveFocus();
    expect(login).not.toHaveBeenCalled();
  });

  it('logs in with the normalised e-mail and goes to the protected home page', async () => {
    vi.mocked(login).mockResolvedValue({
      ok: true,
      status: 200,
      body: { user: { handle: 'a', displayName: 'A' } },
    });
    render(<LoginForm />);

    fillAndSubmit(' Alex@Exemple.fr ', 'ancien-mot-2!');

    await waitFor(() => expect(push).toHaveBeenCalledWith('/accueil'));
    expect(login).toHaveBeenCalledWith('alex@exemple.fr', 'ancien-mot-2!');
  });

  it('shows the generic message for wrong credentials', async () => {
    vi.mocked(login).mockResolvedValue({
      ok: false,
      problem: { status: 401, title: 'Unauthorized', detail: 'Invalid credentials.' },
    });
    render(<LoginForm />);

    fillAndSubmit('alex@exemple.fr', 'mauvais');

    expect(await screen.findByRole('alert')).toHaveTextContent('Identifiants incorrects.');
    expect(push).not.toHaveBeenCalled();
  });

  it('links an unverified account to the code page', async () => {
    vi.mocked(login).mockResolvedValue({
      ok: false,
      problem: { status: 403, title: 'Forbidden', detail: 'Account not verified.' },
    });
    render(<LoginForm />);

    fillAndSubmit('Alex@Exemple.fr', 'mot-de-passe-1!');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Votre compte n’est pas encore validé.');
    expect(screen.getByRole('link', { name: 'Saisir mon code' })).toHaveAttribute(
      'href',
      '/signup/code?email=alex%40exemple.fr',
    );
  });

  it('shows how long to wait after too many attempts', async () => {
    vi.mocked(login).mockResolvedValue({
      ok: false,
      problem: { status: 429, title: 'Too Many Requests', detail: 'Locked.', retryAfterSeconds: 900 },
    });
    render(<LoginForm />);

    fillAndSubmit('alex@exemple.fr', 'mauvais');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Trop de tentatives. Réessayez dans 15 minutes.',
    );
  });

  it('confirms a freshly verified account and pre-fills its e-mail', () => {
    givenUrl('verified=1&email=alex%40exemple.fr');
    render(<LoginForm />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Votre compte est validé. Connectez-vous pour continuer.',
    );
    expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('alex@exemple.fr');
  });
});
