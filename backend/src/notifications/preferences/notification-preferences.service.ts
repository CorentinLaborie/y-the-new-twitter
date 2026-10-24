import { Injectable, NotFoundException } from '@nestjs/common';
import type { NotificationType } from '../../database/generated/client/client';
import type { SessionUser } from '../../auth/session/session-user.repository';
import { NotificationPreferencesDto, PREFERENCE_TYPES } from './dto/notification-preference.dto';
import { NotificationPreferencesRepository } from './notification-preferences.repository';

const UNKNOWN_TYPE = 'Type de notification inconnu.';

/** The notification preferences of the signed-in account (plan L5, step 8). */
@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly preferences: NotificationPreferencesRepository) {}

  async list(viewer: SessionUser): Promise<NotificationPreferencesDto> {
    return { items: await this.preferences.findAll(viewer.id) };
  }

  /** Switches one type on or off. A type the model does not know is not found (404). */
  async set(viewer: SessionUser, type: string, enabled: boolean) {
    if (!(PREFERENCE_TYPES as readonly string[]).includes(type)) {
      throw new NotFoundException(UNKNOWN_TYPE);
    }
    const row = await this.preferences.upsert(viewer.id, type as NotificationType, enabled);

    return { type: row.type, enabled: row.enabled };
  }
}
