import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface EnrolledFactor {
  readonly totpSecretEncrypted: string;
  /** Time step of the last accepted TOTP code, or null before the first one (DEC-082). */
  readonly lastUsedStep: bigint | null;
}

/** The writes of the second factor: admin_mfa and admin_backup_codes. The checks live in AdminMfaService. */
@Injectable()
export class AdminMfaRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUser(userId: string): Promise<EnrolledFactor | null> {
    return this.prisma.adminMfa.findUnique({
      where: { userId },
      select: { totpSecretEncrypted: true, lastUsedStep: true },
    });
  }

  /** Enrols the factor and its backup codes in one transaction: both exist or neither does. */
  async enrol(userId: string, totpSecretEncrypted: string, step: number, codeHashes: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.adminMfa.create({
        data: { userId, totpSecretEncrypted, lastUsedStep: BigInt(step) },
      }),
      this.prisma.adminBackupCode.createMany({
        data: codeHashes.map((codeHash) => ({ userId, codeHash })),
      }),
    ]);
  }

  /**
   * Moves the last used step forward. Returns false when this step or a later one was already used, so a code
   * cannot be accepted twice, even by two requests at the same time.
   */
  async advanceStep(userId: string, step: number): Promise<boolean> {
    const result = await this.prisma.adminMfa.updateMany({
      where: { userId, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: BigInt(step) } }] },
      data: { lastUsedStep: BigInt(step) },
    });

    return result.count === 1;
  }

  /** Marks an unused backup code as used. Returns false when the code is unknown or already used. */
  async consumeBackupCode(userId: string, codeHash: string): Promise<boolean> {
    const result = await this.prisma.adminBackupCode.updateMany({
      where: { userId, codeHash, usedAt: null },
      data: { usedAt: new Date() },
    });

    return result.count === 1;
  }
}
