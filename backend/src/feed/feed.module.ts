import { Module } from '@nestjs/common';
import { QuestionsModule } from '../questions/questions.module';
import { FeedController } from './feed.controller';
import { FeedRepository } from './feed.repository';
import { FeedService } from './feed.service';

@Module({
  imports: [QuestionsModule],
  controllers: [FeedController],
  providers: [FeedService, FeedRepository],
})
export class FeedModule {}
