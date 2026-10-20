import type { PrismaService } from '../../database/prisma.service';
import { SessionUserRepository } from './session-user.repository';

function repositoryWith(findUnique: jest.Mock) {
  const prisma = { user: { findUnique } };
  return new SessionUserRepository(prisma as unknown as PrismaService);
}

describe('SessionUserRepository.suspensionReasonOf', () => {
  it('returns the stored reason of the suspension, looked up by the user ID', async () => {
    const findUnique = jest.fn().mockResolvedValue({ suspensionReason: 'Spam répété.' });

    expect(await repositoryWith(findUnique).suspensionReasonOf('user-1')).toBe('Spam répété.');
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' }, select: { suspensionReason: true } });
  });

  it('returns null when the account has no reason stored', async () => {
    const findUnique = jest.fn().mockResolvedValue({ suspensionReason: null });

    expect(await repositoryWith(findUnique).suspensionReasonOf('user-1')).toBeNull();
  });

  it('returns null when the account does not exist', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);

    expect(await repositoryWith(findUnique).suspensionReasonOf('gone')).toBeNull();
  });
});
