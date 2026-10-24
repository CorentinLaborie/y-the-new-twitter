import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { NotificationPreferencesController } from './preferences/notification-preferences.controller';
import { NotificationPreferencesRepository } from './preferences/notification-preferences.repository';
import { NotificationPreferencesService } from './preferences/notification-preferences.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

/** Notifications of a viewer (L2): the list, the unread count and the reading of the page. */
@Module({
  imports: [UsersModule],
  controllers: [NotificationsController, NotificationPreferencesController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    NotificationPreferencesService,
    NotificationPreferencesRepository,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
