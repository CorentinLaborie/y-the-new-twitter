import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { raw } from 'express';
import { AccountSettingsController } from './account-settings.controller';
import { AccountSettingsService } from './account-settings.service';
import { AvatarController } from './avatar.controller';
import { AVATAR_MAX_BYTES, AvatarService } from './avatar.service';
import { AvatarStorage } from './avatar.storage';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { UsersRepository } from './users.repository';

@Module({
  controllers: [AccountSettingsController, ProfileController, AvatarController],
  providers: [UsersRepository, AccountSettingsService, ProfileService, AvatarService, AvatarStorage],
  exports: [UsersRepository],
})
export class UsersModule implements NestModule {
  /** The photo upload is read as raw bytes, for the three accepted formats and one byte over the limit (2.1). */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: AVATAR_MAX_BYTES + 1 }))
      .forRoutes(AvatarController);
  }
}
