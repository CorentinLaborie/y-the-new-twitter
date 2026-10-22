import { ConflictException, Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../database/generated/client/client';
import { PrismaService } from '../../database/prisma.service';
import { MAIL_SENDER, type MailSender } from '../../common/mail/mail-sender';
import { UsersRepository } from '../../users/users.repository';
import { CURRENT_TERMS_VERSION, isOldEnough, MINIMUM_AGE, normalisePhone } from '../account-rules';
import { AGE_VERIFIER, type AgeVerifier } from '../age-verifier';
import { CodeRequestLimitService } from '../rate-limit/code-request-limit.service';
import { hashPassword } from '../password';
import { CODE_MAX_ATTEMPTS, generateCode, hashCode, verifyCode } from '../verification-code';
import { SignupDto } from '../dto/signup.dto';
import { ResendSignupDto } from './dto/resend-signup.dto';
import { VerifySignupDto } from './dto/verify-signup.dto';
import { SignupActivationRepository } from './signup-activation.repository';
import { SignupCodesRepository } from './signup-codes.repository';
import { signupCodeMail } from './signup-mail';

const INVALID_CODE = 'Le code est incorrect, expiré ou a été épuisé.';
const AGE_REFUSED = `Vous devez avoir au moins ${MINIMUM_AGE} ans pour vous inscrire.`;

/** The three signup flows: create, verify, resend (sections 8.2 and 9.4). */
@Injectable()
export class SignupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly users: UsersRepository,
    private readonly codes: SignupCodesRepository,
    private readonly activation: SignupActivationRepository,
    private readonly codeRequests: CodeRequestLimitService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    @Inject(AGE_VERIFIER) private readonly ageVerifier: AgeVerifier,
  ) {}

  /**
   * Creates a pending account and sends its code. When the e-mail already has an account,
   * nothing is created or sent: the caller gets the same answer either way.
   */
  async signup(dto: SignupDto): Promise<void> {
    // Minors are refused before anything is stored or sent (R7).
    if (!isOldEnough(dto.birthDate, new Date())) {
      throw new UnprocessableEntityException(AGE_REFUSED);
    }
    const phone = this.phoneOf(dto.phone);
    if (await this.users.findByHandle(dto.handle)) {
      throw new ConflictException('Ce pseudo est déjà pris.');
    }

    // Both answers pay the same hashing cost, so the timing does not reveal the account either.
    const passwordHash = await hashPassword(dto.password);
    const { code, codeHash } = await this.newCode();
    if (await this.users.findByEmail(dto.email)) {
      return;
    }

    const created = await this.createPendingAccount(dto, phone, passwordHash, codeHash);
    if (!created) {
      return;
    }

    await this.mail.send(signupCodeMail(dto.email, code, this.ttlMinutes()));
  }

  /**
   * Checks the code, then the age. The code is used once; five wrong codes make it unusable.
   * A refused age leaves the account pending and records the refusal.
   */
  async verify(dto: VerifySignupDto): Promise<void> {
    const now = new Date();
    const user = await this.users.findByEmail(dto.email);
    const openCode =
      user?.status === 'pending_verification' ? await this.codes.findOpen(this.prisma, user.id, now) : null;
    if (!user || !openCode) {
      throw new UnprocessableEntityException(INVALID_CODE);
    }

    if (!(await this.codes.reserveAttempt(this.prisma, openCode.id, CODE_MAX_ATTEMPTS, now))) {
      throw new UnprocessableEntityException(INVALID_CODE);
    }
    if (!(await verifyCode(openCode.codeHash, dto.code))) {
      throw new UnprocessableEntityException(INVALID_CODE);
    }

    const age = await this.ageVerifier.check(user.birthDate, now);
    const consumed = await this.prisma.$transaction(async (tx) => {
      if (!(await this.codes.consume(tx, openCode.id, now))) {
        return false;
      }
      await this.activation.recordAgeCheck(tx, user.id, age, now);
      if (age.status === 'verified') {
        await this.users.activate(tx, user.id, now);
      }
      return true;
    });
    if (!consumed) {
      throw new UnprocessableEntityException(INVALID_CODE);
    }
    if (age.status === 'failed') {
      throw new UnprocessableEntityException(AGE_REFUSED);
    }
  }

  /**
   * Replaces the open code with a new one and sends it. Nothing happens for an unknown or already active account,
   * or when the account is over its code request limit (section 9.4): the caller cannot tell the difference.
   */
  async resend(dto: ResendSignupDto): Promise<void> {
    const now = new Date();
    const { code, codeHash } = await this.newCode();
    const user = await this.users.findByEmail(dto.email);
    const allowed = await this.codeRequests.allow(user ? { userId: user.id } : { email: dto.email });
    if (user?.status !== 'pending_verification' || !allowed) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await this.codes.invalidateOpen(tx, user.id, now);
      await this.codes.create(tx, {
        userId: user.id,
        codeHash,
        expiresAt: this.expiry(now),
      });
    });
    await this.mail.send(signupCodeMail(dto.email, code, this.ttlMinutes()));
  }

  /**
   * Creates the pending account and its code in one transaction: both are stored, or neither.
   * Returns false when a concurrent signup took the e-mail first. A taken phone number is shown
   * as such (DEC-142); a taken handle is a conflict.
   */
  private async createPendingAccount(
    dto: SignupDto,
    phone: string | null,
    passwordHash: string,
    codeHash: string,
  ): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const user = await this.users.create(
          {
            handle: dto.handle,
            displayName: dto.displayName,
            email: dto.email,
            passwordHash,
            birthDate: dto.birthDate,
            phone,
            termsAcceptedAt: new Date(),
            termsVersion: CURRENT_TERMS_VERSION,
          },
          tx,
        );
        await this.codes.create(tx, {
          userId: user.id,
          codeHash,
          expiresAt: this.expiry(new Date()),
        });
      });
      return true;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      if (await this.users.findByEmail(dto.email)) {
        return false;
      }
      if (uniqueTarget(error).includes('phone')) {
        throw new ConflictException('Ce numéro de téléphone est déjà utilisé.');
      }
      throw new ConflictException('Ce pseudo est déjà pris.');
    }
  }

  private phoneOf(phone: string | undefined): string | null {
    if (phone === undefined || phone.trim() === '') {
      return null;
    }

    const normalised = normalisePhone(phone);
    if (normalised === null) {
      throw new UnprocessableEntityException("Le numéro de téléphone n'est pas un numéro français valide.");
    }

    return normalised;
  }

  private async newCode(): Promise<{ code: string; codeHash: string }> {
    const code = generateCode();
    return { code, codeHash: await hashCode(code) };
  }

  private ttlMinutes(): number {
    return Number(this.config.getOrThrow('Y_CODE_TTL_MINUTES'));
  }

  private expiry(from: Date): Date {
    return new Date(from.getTime() + this.ttlMinutes() * 60_000);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** The columns of the violated unique constraint, as Prisma reports them. */
function uniqueTarget(error: unknown): string {
  const target = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.target : undefined;
  return JSON.stringify(target ?? '');
}
