import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MentionPicker } from './mention-picker';

const suggestions = [
  { handle: 'Robert44', displayName: 'Robert', avatarUrl: null },
  { handle: 'Robert_Lm', displayName: 'Robert L.', avatarUrl: null },
];

describe('MentionPicker', () => {
  it('lists the accounts, the active row marked', () => {
    render(<MentionPicker id="picker" suggestions={suggestions} activeIndex={1} onPick={() => {}} />);

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent('Robert@Robert44');
    expect(options[1]).toHaveTextContent('Robert L.@Robert_Lm');
    expect(options.map((option) => option.getAttribute('aria-selected'))).toEqual(['false', 'true']);
  });

  it('picks the account of the row clicked, by its handle', () => {
    const onPick = vi.fn();
    render(<MentionPicker id="picker" suggestions={suggestions} activeIndex={0} onPick={onPick} />);

    fireEvent.click(screen.getByRole('option', { name: /Robert L\./ }));

    expect(onPick).toHaveBeenCalledWith('Robert_Lm');
  });

  it('renders nothing when no account is proposed', () => {
    const { container } = render(
      <MentionPicker id="picker" suggestions={[]} activeIndex={0} onPick={() => {}} />,
    );

    expect(container.firstChild).toBeNull();
  });
});
