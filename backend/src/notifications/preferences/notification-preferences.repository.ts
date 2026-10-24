import { Injectable } from '@nestjs/common';
import type { NotificationType, Prisma } from '../../database/generated/client/client';
import { PrismaService } from '../../database/prisma.service';

/** The only place that reads and writes the notification preferences (plan L5, 5). */
@Injectable()
export class NotificationPreferencesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.notificationPreference.findMany({
      where: { userId },
      select: { type: true, enabled: true },
      orderBy: { type: 'asc' },
    });
  }

  /** Creates the row of the type when it is missing, otherwise changes it (decision 2026-10-22, DEC-090). */
  upsert(userId: string, type: NotificationType, enabled: boolean): Promise<Prisma.NotificationPreferenceGetPayload<object>> {
    return this.prisma.notificationPreference.upsert({
      where: { userId_type: { userId, type } },
      create: { userId, type, enabled },
      update: { enabled },
    });
  }
}
