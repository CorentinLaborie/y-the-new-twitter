import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyQuestionLink, questionLink } from './copy-link';

describe('questionLink', () => {
  it('builds the share link of a question from the origin', () => {
    expect(questionLink('https://y.example.test', 'q-42')).toBe('https://y.example.test/questions/q-42');
  });
});

describe('copyQuestionLink', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes the link to the clipboard and returns true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyQuestionLink('https://y.example.test/questions/q-42')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://y.example.test/questions/q-42');
  });

  it('returns false when the clipboard refuses the write', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });

    await expect(copyQuestionLink('https://y.example.test/questions/q-42')).resolves.toBe(false);
  });

  it('returns false when the browser has no clipboard API', async () => {
    vi.stubGlobal('navigator', {});

    await expect(copyQuestionLink('https://y.example.test/questions/q-42')).resolves.toBe(false);
  });
});
