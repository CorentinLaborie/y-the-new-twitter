import { isOldEnough } from './account-rules';

export const AGE_VERIFIER = Symbol('AGE_VERIFIER');

/** Outcome of one age check, stored in `age_verifications` (DEC-021). */
export interface AgeCheckResult {
  provider: string;
  status: 'verified' | 'failed';
  providerReference: string | null;
}

/** The age decision. The real provider (VerifAge) waits for its documentation (DEC-021). */
export interface AgeVerifier {
  check(birthDate: Date | null, today: Date): Promise<AgeCheckResult>;
}

/** Stands in for VerifAge until its documentation is available: decides from the birth date alone. */
export class MockAgeVerifier implements AgeVerifier {
  check(birthDate: Date | null, today: Date): Promise<AgeCheckResult> {
    const adult = birthDate !== null && isOldEnough(birthDate, today);

    return Promise.resolve({
      provider: 'VerifAge',
      status: adult ? 'verified' : 'failed',
      providerReference: null,
    });
  }
}
