import { NotFoundException } from '@nestjs/common';
import type { SessionUser } from '../../auth/session/session-user.repository';
import { NotificationPreferencesRepository } from './notification-preferences.repository';
import { NotificationPreferencesService } from './notification-preferences.service';

const VIEWER: SessionUser = {
  id: 'user-1',
  handle: 'alice',
  displayName: 'Alice',
  avatarUrl: null,
  role: 'user',
  status: 'active',
};

describe('NotificationPreferencesService (L5, step 8)', () => {
  let repository: { findAll: jest.Mock; upsert: jest.Mock };
  let service: NotificationPreferencesService;

  beforeEach(() => {
    repository = {
      findAll: jest.fn().mockResolvedValue([{ type: 'follow', enabled: false }]),
      upsert: jest
        .fn()
        .mockImplementation(async (_user: string, type: string, enabled: boolean) => ({ type, enabled })),
    };
    service = new NotificationPreferencesService(repository as unknown as NotificationPreferencesRepository);
  });

  it('lists the stored preferences of the viewer, one element per stored type', async () => {
    await expect(service.list(VIEWER)).resolves.toEqual({ items: [{ type: 'follow', enabled: false }] });
    expect(repository.findAll).toHaveBeenCalledWith('user-1');
  });

  it('switches a known type on and off, and answers the stored value', async () => {
    await expect(service.set(VIEWER, 'reaction_like', false)).resolves.toEqual({
      type: 'reaction_like',
      enabled: false,
    });
    expect(repository.upsert).toHaveBeenCalledWith('user-1', 'reaction_like', false);
  });

  it('answers an unknown type as not found (404), and writes nothing', async () => {
    await expect(service.set(VIEWER, 'unknown_type', true)).rejects.toThrow(NotFoundException);
    expect(repository.upsert).not.toHaveBeenCalled();
  });
});
