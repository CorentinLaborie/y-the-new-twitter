import { MentionsRepository } from './mentions.repository';
import { MentionsService, rankMentionSuggestions, SUGGESTION_LIMIT } from './mentions.service';

type Repository = jest.Mocked<Pick<MentionsRepository, 'findSuggestionCandidates' | 'findVisibleHandles'>>;

const DB = 'tx';
const account = (handle: string) => ({ handle, displayName: handle, avatarUrl: null });

describe('rankMentionSuggestions (M3, selector)', () => {
  it('puts the handles that start with the query first, then the others that contain it', () => {
    const ranked = rankMentionSuggestions(
      [account('Aro_x'), account('Robert44'), account('Roxane'), account('Marc_Ro')],
      'ro',
    );

    expect(ranked.map((suggestion) => suggestion.handle)).toEqual(['Robert44', 'Roxane', 'Aro_x', 'Marc_Ro']);
  });

  it('ignores the case of the query', () => {
    expect(rankMentionSuggestions([account('Robert44')], 'ROB').map((s) => s.handle)).toEqual(['Robert44']);
  });

  it('keeps five accounts at most', () => {
    const many = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'].map(account);

    expect(rankMentionSuggestions(many, 'a')).toHaveLength(SUGGESTION_LIMIT);
    expect(SUGGESTION_LIMIT).toBe(5);
  });

  it('proposes everything when the query is empty', () => {
    expect(rankMentionSuggestions([account('Alice'), account('Bob')], '').map((s) => s.handle)).toEqual([
      'Alice',
      'Bob',
    ]);
  });
});

describe('MentionsService.suggest and linkableHandles', () => {
  let repository: Repository;
  let service: MentionsService;

  beforeEach(() => {
    repository = {
      findSuggestionCandidates: jest.fn().mockResolvedValue([]),
      findVisibleHandles: jest.fn().mockResolvedValue([]),
    };
    service = new MentionsService(repository as unknown as MentionsRepository);
  });

  it('asks the repository for the viewer’s candidates and ranks them', async () => {
    repository.findSuggestionCandidates.mockResolvedValue([account('Marc'), account('Robert44')]);

    const suggestions = await service.suggest(DB as never, 'viewer-id', 'ro');

    expect(repository.findSuggestionCandidates).toHaveBeenCalledWith(DB, 'viewer-id', 'ro');
    expect(suggestions).toEqual([account('Robert44')]);
  });

  it('links only the mentions whose account the viewer may see, in lowercase', async () => {
    repository.findVisibleHandles.mockResolvedValue([{ handle: 'Robert44' }]);

    const linkable = await service.linkableHandles(DB as never, 'viewer-id', [
      '@robert44 et @Ghost',
      'pas de mention',
    ]);

    expect(repository.findVisibleHandles).toHaveBeenCalledWith(DB, 'viewer-id', ['robert44', 'ghost']);
    expect([...linkable]).toEqual(['robert44']);
  });

  it('asks nothing when no text has a mention', async () => {
    expect((await service.linkableHandles(DB as never, 'viewer-id', ['rien'])).size).toBe(0);
    expect(repository.findVisibleHandles).not.toHaveBeenCalled();
  });
});
