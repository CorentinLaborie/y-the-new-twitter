import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { ReactionsController } from './reactions.controller';
import { ReactionsRepository } from './reactions.repository';
import { ReactionsService } from './reactions.service';

@Module({
  imports: [UsersModule],
  controllers: [ReactionsController],
  providers: [ReactionsService, ReactionsRepository],
})
export class ReactionsModule {}
