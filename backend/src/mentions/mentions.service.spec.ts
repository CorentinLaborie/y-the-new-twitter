import { UnprocessableEntityException } from '@nestjs/common';
import { MentionsRepository } from './mentions.repository';
import { MentionsService } from './mentions.service';

type Repository = jest.Mocked<
  Pick<
    MentionsRepository,
    'findActiveByHandles' | 'findBlockBetween' | 'createMentions' | 'writeMentionNotifications'
  >
>;

const DB = 'tx';

describe('MentionsService (B8, B9)', () => {
  let repository: Repository;
  let service: MentionsService;

  beforeEach(() => {
    repository = {
      findActiveByHandles: jest.fn().mockResolvedValue([]),
      findBlockBetween: jest.fn().mockResolvedValue(null),
      createMentions: jest.fn().mockResolvedValue({ count: 0 }),
      writeMentionNotifications: jest.fn().mockResolvedValue({ count: 0 }),
    };
    service = new MentionsService(repository as unknown as MentionsRepository);
  });

  it('resolves the active accounts of the text, without the author', async () => {
    repository.findActiveByHandles.mockResolvedValue([{ id: 'bob-id' }, { id: 'alice-id' }]);

    const ids = await service.resolve(DB as never, 'alice-id', 'Hé @bob et @Alice !');

    expect(repository.findActiveByHandles).toHaveBeenCalledWith(DB, ['bob', 'alice']);
    expect(ids).toEqual(['bob-id']);
  });

  it('returns nothing and asks no question of the database when the text has no mention', async () => {
    expect(await service.resolve(DB as never, 'alice-id', 'Pas de mention ici')).toEqual([]);
    expect(repository.findActiveByHandles).not.toHaveBeenCalled();
  });

  it('returns nothing when the only mention is the author', async () => {
    repository.findActiveByHandles.mockResolvedValue([{ id: 'alice-id' }]);

    expect(await service.resolve(DB as never, 'alice-id', '@alice')).toEqual([]);
    expect(repository.findBlockBetween).not.toHaveBeenCalled();
  });

  it('refuses the whole post when a mentioned account blocks the author or is blocked by them (R14)', async () => {
    repository.findActiveByHandles.mockResolvedValue([{ id: 'bob-id' }]);
    repository.findBlockBetween.mockResolvedValue({ blockerId: 'bob-id' });

    await expect(service.resolve(DB as never, 'alice-id', '@bob')).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(repository.findBlockBetween).toHaveBeenCalledWith(DB, 'alice-id', ['bob-id']);
  });

  it('writes one mention row and one notification per account', async () => {
    await service.record(DB as never, 'alice-id', { questionId: 'q-1' }, ['bob-id', 'carol-id']);

    expect(repository.createMentions).toHaveBeenCalledWith(DB, { questionId: 'q-1' }, ['bob-id', 'carol-id']);
    expect(repository.writeMentionNotifications).toHaveBeenCalledWith(DB, 'alice-id', { questionId: 'q-1' }, [
      'bob-id',
      'carol-id',
    ]);
  });

  it('writes nothing when no account is mentioned', async () => {
    await service.record(DB as never, 'alice-id', { questionId: 'q-1' }, []);

    expect(repository.createMentions).not.toHaveBeenCalled();
    expect(repository.writeMentionNotifications).not.toHaveBeenCalled();
  });
});
