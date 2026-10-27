import { lockAccountGraphExclusive, lockAccountGraphShared } from './account-graph-lock';

/** The SQL text of a tagged template call, as Prisma receives it (the static parts only). */
function sqlOf(call: unknown[]): string {
  const [strings] = call as [TemplateStringsArray];
  return [...strings].join('?');
}

describe('account graph advisory lock (section 6.3)', () => {
  let db: { $queryRaw: jest.Mock };

  beforeEach(() => {
    db = { $queryRaw: jest.fn().mockResolvedValue([{ locked: '' }]) };
  });

  it('takes the shared lock of the graph in one statement, as the first statement of the transaction', async () => {
    await lockAccountGraphShared(db as never);

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(sqlOf(db.$queryRaw.mock.calls[0]!)).toContain('pg_advisory_xact_lock_shared(?::bigint)');
  });

  it('takes the exclusive lock of the graph in one statement, not the shared one', async () => {
    await lockAccountGraphExclusive(db as never);

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = sqlOf(db.$queryRaw.mock.calls[0]!);
    expect(sql).toContain('pg_advisory_xact_lock(?::bigint)');
    expect(sql).not.toContain('_shared');
  });

  it('passes the same key to both locks, so a status change and a follow exclude each other', async () => {
    await lockAccountGraphShared(db as never);
    await lockAccountGraphExclusive(db as never);

    const [sharedKey] = db.$queryRaw.mock.calls[0]!.slice(1);
    const [exclusiveKey] = db.$queryRaw.mock.calls[1]!.slice(1);
    expect(sharedKey).toBe(716203);
    expect(exclusiveKey).toBe(716203);
  });
});
