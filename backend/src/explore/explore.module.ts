import { Module } from '@nestjs/common';
import { QuestionsModule } from '../questions/questions.module';
import { ExploreController } from './explore.controller';
import { ExploreRepository } from './explore.repository';
import { ExploreService } from './explore.service';
import { HashtagsController } from './hashtags.controller';
import { SearchController } from './search.controller';

@Module({
  imports: [QuestionsModule],
  controllers: [ExploreController, SearchController, HashtagsController],
  providers: [ExploreService, ExploreRepository],
})
export class ExploreModule {}
