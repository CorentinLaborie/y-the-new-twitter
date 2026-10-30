import { Module } from '@nestjs/common';
import { AccountSettingsController } from './account-settings.controller';
import { AccountSettingsService } from './account-settings.service';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { UsersRepository } from './users.repository';

@Module({
  controllers: [AccountSettingsController, ProfileController],
  providers: [UsersRepository, AccountSettingsService, ProfileService],
  exports: [UsersRepository],
})
export class UsersModule {}
