import { notificationsPageWhere, notificationsVisibleTo } from './notifications.repository';

const VIEWER_ID = '4c5d6e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const CURSOR_ID = '0f8c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const CREATED = new Date('2026-10-22T10:00:00.000Z');

describe('notificationsVisibleTo', () => {
  it('keeps only the notifications of the viewer', () => {
    expect(notificationsVisibleTo(VIEWER_ID).AND).toContainEqual({ recipientId: VIEWER_ID });
  });

  it('hides a notification whose actor is not active or is blocked in either direction (R13, R14)', () => {
    const actorRule = notificationsVisibleTo(VIEWER_ID).AND;

    expect(JSON.stringify(actorRule)).toContain('"status":"active"');
    expect(JSON.stringify(actorRule)).toContain(`"blockedId":"${VIEWER_ID}"`);
    expect(JSON.stringify(actorRule)).toContain(`"blockerId":"${VIEWER_ID}"`);
  });

  it('hides a notification whose question or reply is hidden or deleted', () => {
    const serialized = JSON.stringify(notificationsVisibleTo(VIEWER_ID).AND);

    expect(serialized).toContain('"deletedAt":null');
    expect(serialized).toContain('"moderationStatus":"visible"');
  });
});

describe('notificationsPageWhere', () => {
  it('adds the type filter when a type is given', () => {
    const where = notificationsPageWhere(VIEWER_ID, 'mention', undefined);

    expect(where.AND).toContainEqual({ type: 'mention' });
  });

  it('adds no type filter when none is given', () => {
    const where = notificationsPageWhere(VIEWER_ID, undefined, undefined);

    expect(JSON.stringify(where.AND)).not.toContain('"type"');
  });

  it('continues after the cursor, on the creation time then the id', () => {
    const where = notificationsPageWhere(VIEWER_ID, undefined, { createdAt: CREATED, id: CURSOR_ID });

    expect(where.AND).toContainEqual({
      OR: [{ createdAt: { lt: CREATED } }, { createdAt: CREATED, id: { lt: CURSOR_ID } }],
    });
  });
});
