import { describe, expect, it } from 'vitest';
import type { ApiProblem } from '@/lib/api-client';
import type { ConversationView } from '@/lib/messages-api';
import {
  canWrite,
  composerNotice,
  conversationStateLabel,
  formatMessageTime,
  listOptionsFor,
  loadFailureMessage,
  sendFailureMessage,
  listPreview,
} from './message-rules';

const BASE: ConversationView = {
  id: 'c1',
  status: 'accepted',
  initiatedByViewer: true,
  other: { handle: 'MarkL', displayName: 'MarkL' },
  lastMessageAt: '2026-10-27T09:33:00.000Z',
  lastMessage: null,
  unread: false,
  muted: false,
  archived: false,
};

const problem = (status: number): ApiProblem => ({ status, title: 'x', detail: 'x' });

describe('listOptionsFor', () => {
  it('reads the accepted conversations on the messages tab and the requests and archives on theirs', () => {
    expect(listOptionsFor('messages')).toEqual({});
    expect(listOptionsFor('requests')).toEqual({ requests: true });
    expect(listOptionsFor('archived')).toEqual({ archived: true });
  });
});

describe('conversationStateLabel', () => {
  it('names a request, a refusal and the mute, and is empty for a plain conversation', () => {
    expect(conversationStateLabel({ ...BASE, status: 'pending' })).toBe('En attente');
    expect(conversationStateLabel({ ...BASE, status: 'declined' })).toBe('Refusée');
    expect(conversationStateLabel({ ...BASE, muted: true })).toBe('En sourdine');
    expect(conversationStateLabel(BASE)).toBe('');
  });
});

describe('canWrite', () => {
  it('lets the viewer write in an accepted conversation', () => {
    expect(canWrite(BASE, false)).toBe(true);
  });

  it('closes a declined conversation', () => {
    expect(canWrite({ ...BASE, status: 'declined' }, false)).toBe(false);
  });

  it('lets the sender of a request write one message only, until it is accepted', () => {
    const sent = { ...BASE, status: 'pending' as const, initiatedByViewer: true };
    expect(canWrite(sent, false)).toBe(true);
    expect(canWrite(sent, true)).toBe(false);
  });

  it('keeps the recipient of a request from writing before they accept it', () => {
    expect(canWrite({ ...BASE, status: 'pending', initiatedByViewer: false }, false)).toBe(false);
  });
});

describe('composerNotice', () => {
  it('returns no notice when the viewer can write', () => {
    expect(composerNotice(BASE, false)).toBeNull();
  });

  it('explains a refusal, a request to accept, and the one-message rule', () => {
    expect(composerNotice({ ...BASE, status: 'declined' }, false)).toBe('Cette demande a été refusée.');
    expect(composerNotice({ ...BASE, status: 'pending', initiatedByViewer: false }, false)).toBe(
      'Acceptez la demande avant de répondre.',
    );
    expect(composerNotice({ ...BASE, status: 'pending', initiatedByViewer: true }, true)).toBe(
      'La demande attend une réponse : un seul message à la fois.',
    );
  });
});

describe('failure messages', () => {
  it('gives French texts by status, never the API detail', () => {
    expect(sendFailureMessage(problem(404))).toBe('Cette conversation n’est plus disponible.');
    expect(sendFailureMessage(problem(409))).toContain('Actualisez la page');
    expect(sendFailureMessage(problem(422))).toContain('longueur');
    expect(sendFailureMessage(problem(500))).toBe('Le message n’a pas pu être envoyé. Réessayez.');
    expect(loadFailureMessage(problem(404))).toBe('Cette conversation n’est plus disponible.');
    expect(loadFailureMessage(problem(500))).toBe('Les messages n’ont pas pu être chargés. Réessayez.');
  });
});

describe('formatMessageTime', () => {
  it('shows the clock time for today and the date for another day', () => {
    const now = new Date('2026-10-27T12:00:00');
    expect(formatMessageTime('2026-10-27T09:33:00', now)).toMatch(/09.*33/);
    expect(formatMessageTime('2026-10-14T09:33:00', now)).toBe('14/10');
  });
});

describe('listPreview (Messages boards)', () => {
  it('shows the newest text, with « Vous : » when the viewer wrote it', () => {
    expect(listPreview({ ...BASE, lastMessage: { text: 'Salut', mine: true } })).toBe('Vous : Salut');
    expect(listPreview({ ...BASE, lastMessage: { text: 'Bonjour', mine: false } })).toBe('Bonjour');
  });

  it('is empty when the conversation has no message yet', () => {
    expect(listPreview({ ...BASE, lastMessage: null })).toBe('');
  });
});
