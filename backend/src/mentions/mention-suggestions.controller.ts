import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { PrismaService } from '../database/prisma.service';
import { MentionSuggestionQueryDto } from './dto/mention-suggestion-query.dto';
import { MentionSuggestion, MentionsService } from './mentions.service';

/** The accounts the mention selector proposes (section M3). Logged-in, active accounts only (R13). */
@Controller('mentions')
export class MentionSuggestionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mentions: MentionsService,
  ) {}

  @Get('suggestions')
  @ApiOkResponse({ description: 'Up to five accounts the viewer follows or that follow the viewer, matching the query.' })
  @problemDetailsResponse(400, 'The query is not a handle part.')
  @problemDetailsResponse(401, 'Not logged in.')
  async suggestions(
    @CurrentUser() viewer: SessionUser,
    @Query() query: MentionSuggestionQueryDto,
  ): Promise<{ items: MentionSuggestion[] }> {
    return { items: await this.mentions.suggest(this.prisma, viewer.id, query.q) };
  }
}
