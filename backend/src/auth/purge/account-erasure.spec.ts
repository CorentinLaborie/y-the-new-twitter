import { eraseAccount, ERASED_DISPLAY_NAME, ErasureDb } from './account-erasure';

const NOW = new Date('2026-10-21T03:00:00.000Z');

/** A transaction client where every write succeeds, and each write is recorded in call order. */
function fakeTransaction(accountCount = 1) {
  const calls: string[] = [];
  const write = (name: string) =>
    jest.fn(async () => {
      calls.push(name);
      return { count: 0 };
    });
  const rows = (...values: unknown[]) => jest.fn<Promise<unknown[]>, []>(async () => values);
  const tx = {
    user: {
      updateMany: jest.fn(async (args: { data: Record<string, unknown> }) => {
        calls.push(args.data.status === undefined ? 'user.updateMany count' : 'user.updateMany');
        return { count: accountCount };
      }),
    },
    question: {
      findMany: rows({ id: 'question-1' }),
      updateMany: jest.fn(async (args: { data: Record<string, unknown> }) => {
        calls.push(`question.updateMany ${Object.keys(args.data).join(',')}`);
        return { count: 1 };
      }),
    },
    reply: {
      findMany: rows(),
      updateMany: write('reply.updateMany'),
    },
    message: { updateMany: write('message.updateMany') },
    supportMessage: { deleteMany: write('supportMessage.deleteMany') },
    supportThread: { deleteMany: write('supportThread.deleteMany') },
    questionHashtag: { deleteMany: write('questionHashtag.deleteMany') },
    mention: { deleteMany: write('mention.deleteMany') },
    questionReaction: { deleteMany: write('questionReaction.deleteMany') },
    replyReaction: { deleteMany: write('replyReaction.deleteMany') },
    follow: { findMany: rows(), deleteMany: write('follow.deleteMany') },
    block: { deleteMany: write('block.deleteMany') },
    bookmark: { deleteMany: write('bookmark.deleteMany') },
    notification: { deleteMany: write('notification.deleteMany') },
    notificationPreference: { deleteMany: write('notificationPreference.deleteMany') },
    conversationParticipant: { deleteMany: write('conversationParticipant.deleteMany') },
    ageVerification: { deleteMany: write('ageVerification.deleteMany') },
    signupCode: { deleteMany: write('signupCode.deleteMany') },
    passwordResetCode: { deleteMany: write('passwordResetCode.deleteMany') },
    emailChangeCode: { deleteMany: write('emailChangeCode.deleteMany') },
    session: { deleteMany: write('session.deleteMany') },
    idempotencyKey: { deleteMany: write('idempotencyKey.deleteMany') },
    loginEvent: { deleteMany: write('loginEvent.deleteMany') },
    $executeRaw: jest.fn(async () => {
      calls.push('recalculateCounters');
      return 0;
    }),
    $queryRaw: jest.fn(async () => []),
  };
  return { tx, calls };
}

describe('eraseAccount (R16, DEC-024, DEC-067)', () => {
  it('writes nothing more when the account is not pending deletion, or its window is still open', async () => {
    const { tx, calls } = fakeTransaction(0);

    await expect(eraseAccount(tx as unknown as ErasureDb, 'user-1', NOW)).resolves.toBe(false);

    expect(calls).toEqual(['user.updateMany']);
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', status: 'pending_deletion', deletionPurgeAt: { lte: NOW } },
      data: expect.any(Object),
    });
  });

  it('replaces the personal data with placeholders, and sets the account to deleted', async () => {
    const { tx } = fakeTransaction();

    await eraseAccount(tx as unknown as ErasureDb, 'a1b2c3d4-0000-4000-8000-000000000001', NOW);

    const data = tx.user.updateMany.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: 'deleted',
      deletedAt: NOW,
      displayName: ERASED_DISPLAY_NAME,
      handle: 'deleted_a1b2c3d4000040008000',
      email: 'deleted-a1b2c3d4-0000-4000-8000-000000000001@erased.invalid',
      phone: null,
      birthDate: null,
      bio: null,
      avatarUrl: null,
      role: 'user',
    });
    expect(data.passwordHash).not.toMatch(/^\$argon2/);
  });

  it('recalculates the counters after the status change and before the reactions go', async () => {
    const { tx, calls } = fakeTransaction();

    await eraseAccount(tx as unknown as ErasureDb, 'user-1', NOW);

    expect(calls.indexOf('recalculateCounters')).toBeGreaterThan(calls.indexOf('user.updateMany'));
    expect(calls.indexOf('recalculateCounters')).toBeLessThan(calls.indexOf('questionReaction.deleteMany'));
  });

  it('hides the content before it empties the body, so the body constraint holds', async () => {
    const { tx, calls } = fakeTransaction();

    await eraseAccount(tx as unknown as ErasureDb, 'user-1', NOW);

    const hide = calls.indexOf('question.updateMany deletedAt');
    const empty = calls.indexOf('question.updateMany body');
    expect(hide).toBeGreaterThanOrEqual(0);
    expect(empty).toBeGreaterThan(hide);
    expect(tx.question.updateMany).toHaveBeenCalledWith({
      where: { authorId: 'user-1' },
      data: { body: '' },
    });
  });

  it('removes the hashtag links and the mentions of its questions, and the mentions of the account', async () => {
    const { tx } = fakeTransaction();

    await eraseAccount(tx as unknown as ErasureDb, 'user-1', NOW);

    expect(tx.questionHashtag.deleteMany).toHaveBeenCalledWith({
      where: { questionId: { in: ['question-1'] } },
    });
    expect(tx.mention.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ questionId: { in: ['question-1'] } }, { replyId: { in: [] } }, { mentionedUserId: 'user-1' }],
      },
    });
  });

  it('leaves the follow counts of the other accounts to the recount, and removes the links after it', async () => {
    const { tx } = fakeTransaction();

    await eraseAccount(tx as unknown as ErasureDb, 'user-1', NOW);

    const decrements = tx.user.updateMany.mock.calls.filter(([args]) =>
      JSON.stringify(args).includes('decrement'),
    );
    expect(decrements).toEqual([]);
    expect(tx.follow.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ followerId: 'user-1' }, { followeeId: 'user-1' }] },
    });
  });

  it('empties the text of the private messages the account sent, and keeps the row (DEC-029)', async () => {
    const { tx, calls } = fakeTransaction();

    await eraseAccount(tx as unknown as ErasureDb, 'user-1', NOW);

    expect(tx.message.updateMany).toHaveBeenCalledWith({ where: { senderId: 'user-1' }, data: { body: '' } });
    expect(calls.indexOf('message.updateMany')).toBeGreaterThan(calls.indexOf('reply.updateMany'));
  });

  it('deletes the contact threads of the account with their messages (DEC-024, DEC-080)', async () => {
    const { tx, calls } = fakeTransaction();

    await eraseAccount(tx as unknown as ErasureDb, 'user-1', NOW);

    expect(tx.supportMessage.deleteMany).toHaveBeenCalledWith({ where: { thread: { userId: 'user-1' } } });
    expect(tx.supportThread.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(calls.indexOf('supportMessage.deleteMany')).toBeLessThan(
      calls.indexOf('supportThread.deleteMany'),
    );
  });

  it('deletes the login events, codes, sessions and idempotency keys of the account (DEC-065)', async () => {
    const { tx } = fakeTransaction();

    await eraseAccount(tx as unknown as ErasureDb, 'user-1', NOW);

    const tables = [
      tx.loginEvent,
      tx.session,
      tx.idempotencyKey,
      tx.signupCode,
      tx.passwordResetCode,
      tx.emailChangeCode,
    ];
    for (const table of tables) {
      expect(table.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    }
  });
});
