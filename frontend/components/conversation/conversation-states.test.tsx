import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConversationClosed } from './conversation-states';

describe('ConversationClosed', () => {
  it('says how many Y are still missing before the replies open', () => {
    render(<ConversationClosed yCount={12} yThreshold={50} />);

    expect(screen.getByText('Il manque encore 38 Y.')).toBeInTheDocument();
  });

  it('never shows a negative count of missing Y', () => {
    render(<ConversationClosed yCount={60} yThreshold={50} />);

    expect(screen.getByText('Il manque encore 0 Y.')).toBeInTheDocument();
    expect(screen.queryByText(/-/)).not.toBeInTheDocument();
  });
});
