import { Module } from '@nestjs/common';
import { MentionSuggestionsController } from './mention-suggestions.controller';
import { MentionsRepository } from './mentions.repository';
import { MentionsService } from './mentions.service';

@Module({
  controllers: [MentionSuggestionsController],
  providers: [MentionsService, MentionsRepository],
  exports: [MentionsService],
})
export class MentionsModule {}
