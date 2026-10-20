import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Landing } from './landing';

describe('Landing', () => {
  it('has one h1, the page title', () => {
    render(<Landing />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Y, le réseau social qui vous fait réfléchir.',
    );
  });

  it('links guests to the sign-in, sign-up and legal pages', () => {
    render(<Landing />);

    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Créer mon compte' })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: 'Conditions d’utilisation' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Politique de confidentialité' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(screen.getByRole('link', { name: 'Utilisation des cookies' })).toHaveAttribute('href', '/cookies');
  });

  it('describes the hero photo and hides the decorative ones', () => {
    render(<Landing />);

    expect(screen.getByAltText('Un homme consulte son téléphone')).toBeInTheDocument();
    expect(screen.getAllByAltText('')).toHaveLength(2);
  });
});
