import { Module } from '@nestjs/common';
import { AccountSettingsController } from './account-settings.controller';
import { AccountSettingsService } from './account-settings.service';
import { UsersRepository } from './users.repository';

@Module({
  controllers: [AccountSettingsController],
  providers: [UsersRepository, AccountSettingsService],
  exports: [UsersRepository],
})
export class UsersModule {}
