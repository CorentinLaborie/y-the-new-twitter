import { ForbiddenException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { SessionUser } from '../auth/session/session-user.repository';
import { PrismaService } from '../database/prisma.service';
import type { CreateSupportMessageDto } from './dto/create-support-message.dto';
import type { SupportMessageResponseDto } from './dto/support-message-response.dto';
import { SupportDb, SupportRepository } from './support.repository';
import {
  contactReferencePrefix,
  isContactTextValid,
  nextContactReference,
  normalizeContactText,
} from './support-rules';

const TEXT_LENGTH_MESSAGE = 'Le message doit contenir de 1 à 1000 caractères.';
/** Same refusal as the session guard gives an account outside the allowed statuses; the guard runs first in practice. */
const NOT_SUSPENDED_MESSAGE = 'Accès refusé.';

/**
 * Contact messages of suspended accounts (section 3.4). The message joins the open thread of the account, or opens a
 * new one when there is none (DEC-116). Only a suspended account can write: the route allows that status only, and
 * the status is checked again under the account lock, so a lifted suspension cannot open a thread meanwhile.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: SupportRepository,
  ) {}

  /** Writes the message in one transaction. Two messages of one account run one at a time, so there is one open thread. */
  async sendMessage(
    viewer: SessionUser,
    dto: CreateSupportMessageDto,
    now: Date = new Date(),
  ): Promise<SupportMessageResponseDto> {
    const text = normalizeContactText(dto.text);
    if (!isContactTextValid(text)) {
      throw new UnprocessableEntityException(TEXT_LENGTH_MESSAGE);
    }

    return this.prisma.$transaction(async (tx) => {
      if ((await this.support.lockAccountStatus(tx, viewer.id)) !== 'suspended') {
        throw new ForbiddenException(NOT_SUSPENDED_MESSAGE);
      }

      const thread = await this.openOrReuseThread(tx, viewer.id, now);
      await this.support.createUserMessage(tx, thread.id, viewer.id, text);

      return { reference: thread.reference };
    });
  }

  /** The open thread of the account, put back to `new`; or a new thread when the account has none open. */
  private async openOrReuseThread(
    db: SupportDb,
    userId: string,
    now: Date,
  ): Promise<{ id: string; reference: string }> {
    const open = await this.support.findOpenThread(db, userId);
    if (open) {
      await this.support.markNew(db, open.id, userId);
      return open;
    }

    await this.support.lockReferenceNumbering(db);
    const previous = await this.support.findLastReference(db, contactReferencePrefix(now));
    return this.support.createThread(db, nextContactReference(now, previous), userId);
  }
}
