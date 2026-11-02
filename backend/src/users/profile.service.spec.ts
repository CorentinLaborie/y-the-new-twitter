import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '../database/generated/client/client';
import type { SessionUser } from '../auth/session/session-user.repository';
import { ProfileService } from './profile.service';
import type { UsersRepository } from './users.repository';

const VIEWER: SessionUser = { id: 'user-1', handle: 'alice' } as SessionUser;
const DB = { tag: 'transaction' };

function repositoryWith(overrides: Partial<Record<keyof UsersRepository, unknown>> = {}) {
  return {
    transaction: jest.fn(async (run: (db: unknown) => Promise<unknown>) => run(DB)),
    lockActiveAccount: jest.fn().mockResolvedValue(true),
    findOtherHandleOwner: jest.fn().mockResolvedValue(null),
    updateProfile: jest.fn().mockImplementation(async (_db: unknown, _id: string, fields: object) => ({
      handle: 'alice',
      displayName: 'Alice',
      bio: null,
      ...fields,
    })),
    ...overrides,
  };
}

describe('ProfileService.update (plan L1, 1.2)', () => {
  it('writes the given fields and returns the profile', async () => {
    const repo = repositoryWith();
    const service = new ProfileService(repo as unknown as UsersRepository);

    const result = await service.update(VIEWER, { displayName: 'Alice Martin' });

    expect(repo.updateProfile).toHaveBeenCalledWith(DB, 'user-1', { displayName: 'Alice Martin' });
    expect(result).toEqual({ handle: 'alice', displayName: 'Alice Martin', bio: null });
  });

  it('checks the handle against the other accounts only when it is given', async () => {
    const repo = repositoryWith();
    const service = new ProfileService(repo as unknown as UsersRepository);

    await service.update(VIEWER, { bio: 'Bonjour' });
    expect(repo.findOtherHandleOwner).not.toHaveBeenCalled();

    await service.update(VIEWER, { handle: 'Bob_02' });
    expect(repo.findOtherHandleOwner).toHaveBeenCalledWith(DB, 'Bob_02', 'user-1');
  });

  it('refuses a handle that another account uses, whatever its case, and writes nothing', async () => {
    const repo = repositoryWith({ findOtherHandleOwner: jest.fn().mockResolvedValue({ id: 'user-2' }) });
    const service = new ProfileService(repo as unknown as UsersRepository);

    await expect(service.update(VIEWER, { handle: 'BOB' })).rejects.toBeInstanceOf(ConflictException);
    expect(repo.updateProfile).not.toHaveBeenCalled();
  });

  it('refuses a handle taken between the check and the write (unique index)', async () => {
    const uniqueViolation = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const repo = repositoryWith({ updateProfile: jest.fn().mockRejectedValue(uniqueViolation) });
    const service = new ProfileService(repo as unknown as UsersRepository);

    await expect(service.update(VIEWER, { handle: 'bob' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets any other write error through unchanged', async () => {
    const failure = new Error('database down');
    const repo = repositoryWith({ updateProfile: jest.fn().mockRejectedValue(failure) });
    const service = new ProfileService(repo as unknown as UsersRepository);

    await expect(service.update(VIEWER, { bio: 'x' })).rejects.toBe(failure);
  });

  it('refuses an account that is not active, and writes nothing (R13)', async () => {
    const repo = repositoryWith({ lockActiveAccount: jest.fn().mockResolvedValue(false) });
    const service = new ProfileService(repo as unknown as UsersRepository);

    await expect(service.update(VIEWER, { displayName: 'Alice' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.updateProfile).not.toHaveBeenCalled();
  });
});
