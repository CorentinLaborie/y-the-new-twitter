import { AuditEntry, auditHmac, verifyAuditChain } from './audit-chain';

// Test-only key from the reference test vector (database reference, DEC-112, DEC-128). Never a real secret.
const SAMPLE_KEY = 'sample-key-not-secret';
const GENESIS_PREV_HASH = '0'.repeat(64);

const FIRST_HMAC = 'a470a43289fabd515ad045997615e4d7408e2131b751860eec58f417c54241b9';
const SECOND_HMAC = 'e6332f9501c04eec720b18a7a226851d54d0d327a24212018b0efe026d3cbff4';

const firstEntry: AuditEntry = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  actorId: '1b4e28ba-2fa1-11d2-883f-0016d3cca427',
  action: 'report.decide',
  result: 'ok',
  targetType: 'report',
  targetId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  reason: 'Harcèlement confirmé',
  details: { after: { status: 'resolved' }, before: { status: 'open' } },
  createdAt: new Date('2026-10-16T10:41:03.250Z'),
  prevHash: GENESIS_PREV_HASH,
};

const secondEntry: AuditEntry = {
  id: '9b2d1f3a-6c5e-4a7b-8d9f-1e2a3b4c5d6e',
  actorId: '1b4e28ba-2fa1-11d2-883f-0016d3cca427',
  action: 'content.hide',
  result: 'ok',
  targetType: 'question',
  targetId: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
  reason: null,
  details: { after: { moderation_status: 'hidden' }, before: { moderation_status: 'visible' } },
  createdAt: new Date('2026-10-16T10:45:17.802Z'),
  prevHash: FIRST_HMAC,
};

describe('audit chain (reference test vector)', () => {



  it('computes both HMACs of the reference', () => {
    expect(auditHmac(SAMPLE_KEY, firstEntry)).toBe(FIRST_HMAC);
    expect(auditHmac(SAMPLE_KEY, secondEntry)).toBe(SECOND_HMAC);
  });

  it('accepts the reference chain', () => {
    expect(verifyAuditChain([firstEntry, secondEntry], SAMPLE_KEY)).toEqual({ valid: true, brokenAt: null });
  });

  it('detects an altered first entry', () => {
    const altered = { ...firstEntry, reason: 'Harcèlement' };

    expect(verifyAuditChain([altered, secondEntry], SAMPLE_KEY)).toEqual({ valid: false, brokenAt: 1 });
  });

  it('detects a chain checked with another key', () => {
    expect(verifyAuditChain([firstEntry, secondEntry], 'another-key')).toEqual({ valid: false, brokenAt: 1 });
  });

  it('does not report the purged rows before the oldest kept entry', () => {
    expect(verifyAuditChain([secondEntry], SAMPLE_KEY)).toEqual({ valid: true, brokenAt: null });
  });

  it('hashes the same text whatever order the details keys were stored in', () => {
    const reordered = {
      ...firstEntry,
      details: { before: { status: 'open' }, after: { status: 'resolved' } },
    };

    expect(auditHmac(SAMPLE_KEY, reordered)).toBe(FIRST_HMAC);
  });

});
