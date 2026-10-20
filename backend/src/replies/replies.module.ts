import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { RepliesController } from './replies.controller';
import { RepliesRepository } from './replies.repository';
import { RepliesService } from './replies.service';
import { ReplyReactionsController } from './reply-reactions.controller';
import { ReplyReactionsService } from './reply-reactions.service';

@Module({
  imports: [IdempotencyModule],
  controllers: [RepliesController, ReplyReactionsController],
  providers: [RepliesService, RepliesRepository, ReplyReactionsService],
})
export class RepliesModule {}
