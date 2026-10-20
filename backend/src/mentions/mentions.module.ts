import { Module } from '@nestjs/common';
import { MentionsRepository } from './mentions.repository';
import { MentionsService } from './mentions.service';

@Module({
  providers: [MentionsService, MentionsRepository],
  exports: [MentionsService],
})
export class MentionsModule {}
