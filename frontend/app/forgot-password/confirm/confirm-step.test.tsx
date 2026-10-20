import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { rememberPendingEmail } from '@/lib/pending-email';
import { ConfirmStep } from './confirm-step';

describe('ConfirmStep', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('shows the code form for the address handed over by step 1', async () => {
    rememberPendingEmail('marthe@example.fr');
    render(<ConfirmStep />);

    expect(await screen.findByLabelText('Code à 6 chiffres')).toBeInTheDocument();
    expect(screen.getByLabelText('Nouveau mot de passe')).toBeInTheDocument();
  });

  it('asks for the address again, with a link back to step 1, when none was handed over', async () => {
    render(<ConfirmStep />);

    expect(
      await screen.findByText('Saisissez d’abord votre adresse e-mail pour recevoir un code.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Saisir mon adresse e-mail' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.queryByLabelText('Code à 6 chiffres')).not.toBeInTheDocument();
  });
});
