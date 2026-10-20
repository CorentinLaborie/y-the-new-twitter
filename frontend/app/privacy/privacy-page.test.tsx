import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PrivacyPage from './page';

describe('PrivacyPage', () => {
  it('shows the first sentence of the text', () => {
    render(<PrivacyPage />);

    expect(
      screen.getByText(
        'Ce site est un faux site permettant de montrer mes compétences de développeur Web. Ce site est donc non-lucratif.',
      ),
    ).toBeInTheDocument();
  });
});
