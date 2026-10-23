import { visibleAccountTo } from './account-visibility';

describe('visibleAccountTo (R13, R14)', () => {
  it('keeps only active accounts, with no block in either direction with the viewer', () => {
    expect(visibleAccountTo('viewer-1')).toEqual({
      status: 'active',
      blocks: { none: { blockedId: 'viewer-1' } },
      blockedBy: { none: { blockerId: 'viewer-1' } },
    });
  });
});
