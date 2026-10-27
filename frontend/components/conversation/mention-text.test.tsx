import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { findMentions, MentionText } from './mention-text';

describe('findMentions', () => {
  it('finds the handles of a text, without the @, in order', () => {
    expect(findMentions('@Robert44 tu as raison, et @Juliette_B aussi.').map((m) => m.handle)).toEqual([
      'Robert44',
      'Juliette_B',
    ]);
  });

  it('gives the position and the length of each mention', () => {
    expect(findMentions('Bonjour @alice !')).toEqual([{ handle: 'alice', index: 8, length: 6 }]);
  });

  it('finds nothing in a text without mention', () => {
    expect(findMentions('Pas de mention ici.')).toEqual([]);
  });

  it('does not take an @ inside a word, as in an e-mail address', () => {
    expect(findMentions('écrivez à alice@example.com')).toEqual([]);
  });

  it('does not take an @ right after another @ or a digit or an underscore', () => {
    expect(findMentions('@@alice')).toEqual([]);
    expect(findMentions('a1@bob')).toEqual([]);
    expect(findMentions('a_@bob')).toEqual([]);
  });

  it('takes a handle of 30 characters, and not one of 31', () => {
    const thirty = 'a'.repeat(30);
    const thirtyOne = 'a'.repeat(31);
    expect(findMentions(`@${thirty}`).map((m) => m.handle)).toEqual([thirty]);
    expect(findMentions(`@${thirtyOne}`)).toEqual([]);
  });

  it('takes letters, digits and underscore only: a handle stops at the first other character', () => {
    expect(findMentions('@ali-ce').map((m) => m.handle)).toEqual(['ali']);
    expect(findMentions('@élodie')).toEqual([]);
  });

  it('takes a mention at the start, in the middle and at the end of the text', () => {
    expect(findMentions('@a b @c d @e').map((m) => m.handle)).toEqual(['a', 'c', 'e']);
  });
});

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
