import { Injectable } from '@nestjs/common';
import type { AgeCheckResult } from '../age-verifier';
import type { Db } from './signup-codes.repository';

/**
 * Records the age check of a signup. Called inside the service's transaction, so a code is
 * never used without its outcome. The account itself is written by UsersRepository only.
 */
@Injectable()
export class SignupActivationRepository {
  recordAgeCheck(db: Db, userId: string, check: AgeCheckResult, at: Date) {
    const fields = {
      provider: check.provider,
      providerReference: check.providerReference,
      status: check.status,
      checkedAt: at,
    };

    return db.ageVerification.upsert({
      where: { userId },
      create: { userId, ...fields },
      update: fields,
    });
  }
}
