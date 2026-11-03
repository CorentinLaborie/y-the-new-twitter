import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MentionText } from './mention-text';



describe('MentionText', () => {
  it('shows the text as it was written', () => {
    const text = '@Robert44 je rejoins ton point sur l’écoute.';
    const { container } = render(<MentionText text={text} />);

    expect(container.textContent).toBe(text);
  });

  it('wraps each mention in a span with its handle, and renders no link', () => {
    const { container } = render(<MentionText text="Merci @Robert44 et @MarkL !" />);

    const mentions = Array.from(container.querySelectorAll('[data-mention]'));
    expect(mentions.map((node) => node.getAttribute('data-mention'))).toEqual(['Robert44', 'MarkL']);
    expect(mentions.map((node) => node.textContent)).toEqual(['@Robert44', '@MarkL']);
    expect(container.querySelector('a')).toBeNull();
  });

  it('renders a text without mention as plain text', () => {
    const { container } = render(<MentionText text="Rien à signaler." />);

    expect(container.querySelector('[data-mention]')).toBeNull();
    expect(container.textContent).toBe('Rien à signaler.');
  });

  it('links a mention whose profile the viewer may open, to /u/{handle}', () => {
    const { container } = render(<MentionText text="Merci @Robert44 !" linkable={new Set(['robert44'])} />);

    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/u/Robert44');
    expect(link?.textContent).toBe('@Robert44');
  });

  it('keeps a mention plain when its account is not linkable: banned, deleted or blocked', () => {
    const { container } = render(<MentionText text="Merci @Robert44 !" linkable={new Set(['someone-else'])} />);

    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[data-mention="Robert44"]')?.textContent).toBe('@Robert44');
  });
});
