import { isOldEnough } from './account-rules';

export const AGE_VERIFIER = Symbol('AGE_VERIFIER');

/** Outcome of one age check, stored in `age_verifications` (DEC-021). */
export interface AgeCheckResult {
  provider: string;
  status: 'verified' | 'failed';
  providerReference: string | null;
}

/** The age decision. */
export interface AgeVerifier {
  check(birthDate: Date | null, today: Date): Promise<AgeCheckResult>;
}

/**
 * Decides from the birth date the user declared at signup (owner decision 2026-10-21: no external age provider, since
 * none has been contracted). A false declaration is not detected: the rule is 18 or more, declared by the user.
 */
export class DeclaredAgeVerifier implements AgeVerifier {
  check(birthDate: Date | null, today: Date): Promise<AgeCheckResult> {
    const adult = birthDate !== null && isOldEnough(birthDate, today);

    return Promise.resolve({
      provider: 'declared',
      status: adult ? 'verified' : 'failed',
      providerReference: null,
    });
  }
}
