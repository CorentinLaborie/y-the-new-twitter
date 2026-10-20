import { describe, expect, it } from 'vitest';
import {
  checkQuestion,
  normalizeQuestion,
  QUESTION_MAX_LENGTH,
  questionLength,
  TOO_LONG_MESSAGE,
} from './question-rules';

describe('normalizeQuestion', () => {
  it('removes the spaces and line breaks at the start and at the end, and keeps the inside', () => {
    expect(normalizeQuestion('  \n Pourquoi ?  \t\n')).toBe('Pourquoi ?');
    expect(normalizeQuestion('Deux  mots')).toBe('Deux  mots');
  });
});

describe('questionLength', () => {
  it('counts characters, so a 280-character question reads 280', () => {
    expect(questionLength('a'.repeat(QUESTION_MAX_LENGTH))).toBe(280);
  });

  it('does not count the spaces at the start and at the end', () => {
    expect(questionLength(`  ${'a'.repeat(280)}  `)).toBe(280);
  });

  it('counts an emoji as one character, as the backend does', () => {
    expect(questionLength('😀')).toBe(1);
    expect(questionLength('é')).toBe(1);
  });
});

describe('checkQuestion', () => {
  it('accepts a question of 1 character', () => {
    expect(checkQuestion('?')).toEqual({ ok: true, length: 1 });
  });

  it('accepts exactly 280 characters', () => {
    expect(checkQuestion('a'.repeat(280))).toEqual({ ok: true, length: 280 });
  });

  it('refuses 281 characters, with the length so that the counter can show it', () => {
    expect(checkQuestion('a'.repeat(281))).toEqual({ ok: false, reason: 'too-long', length: 281 });
  });

  it('refuses an empty text and a text of spaces only', () => {
    expect(checkQuestion('')).toEqual({ ok: false, reason: 'empty', length: 0 });
    expect(checkQuestion('   \n ')).toEqual({ ok: false, reason: 'empty', length: 0 });
  });

  it('gives the French refusal message with the limit', () => {
    expect(TOO_LONG_MESSAGE).toBe('Votre question dépasse 280 caractères.');
  });
});
