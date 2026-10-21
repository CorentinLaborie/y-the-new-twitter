import { DeclaredAgeVerifier } from './age-verifier';

describe('DeclaredAgeVerifier (R7, owner decision 2026-10-21)', () => {
  const verifier = new DeclaredAgeVerifier();
  const today = new Date('2026-10-19T00:00:00Z');

  it('verifies someone who turns 18 on or before today', async () => {
    const result = await verifier.check(new Date('2008-10-19'), today);

    expect(result).toEqual({ provider: 'declared', status: 'verified', providerReference: null });
  });

  it('refuses someone who turns 18 tomorrow', async () => {
    const result = await verifier.check(new Date('2008-10-20'), today);

    expect(result.status).toBe('failed');
  });

  it('refuses a missing birth date', async () => {
    const result = await verifier.check(null, today);

    expect(result.status).toBe('failed');
  });
});
