import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { NotificationType } from '../../../database/generated/client/client';

/** The types a preference can be set for: the notification types of the model (plan L5, 6.4). */
export const PREFERENCE_TYPES = Object.values(NotificationType);

/** One stored preference: the type and whether it is switched on. */
export class NotificationPreferenceDto {
  @ApiProperty({ enum: PREFERENCE_TYPES })
  type!: NotificationType;

  @ApiProperty()
  enabled!: boolean;
}

/** The stored preferences of the viewer. A type without a row keeps its default: on. */
export class NotificationPreferencesDto {
  @ApiProperty({ type: [NotificationPreferenceDto] })
  items!: NotificationPreferenceDto[];
}

/** Body of PUT /notification-preferences/{type}. A missing or non-boolean value is a 400 (the DTO convention). */
export class SetNotificationPreferenceDto {
  @IsBoolean()
  enabled!: boolean;
}

