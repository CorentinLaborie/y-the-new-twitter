import { Module } from '@nestjs/common';
import { QuestionsModule } from '../questions/questions.module';
import { BookmarksController } from './bookmarks.controller';
import { BookmarksRepository } from './bookmarks.repository';
import { BookmarksService } from './bookmarks.service';

@Module({
  imports: [QuestionsModule],
  controllers: [BookmarksController],
  providers: [BookmarksService, BookmarksRepository],
})
export class BookmarksModule {}
