import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { MentionsModule } from '../mentions/mentions.module';
import { QuestionsController } from './questions.controller';
import { QuestionsRepository } from './questions.repository';
import { QuestionsService } from './questions.service';

@Module({
  imports: [IdempotencyModule, MentionsModule],
  controllers: [QuestionsController],
  providers: [QuestionsService, QuestionsRepository],
  exports: [QuestionsRepository],
})
export class QuestionsModule {}
