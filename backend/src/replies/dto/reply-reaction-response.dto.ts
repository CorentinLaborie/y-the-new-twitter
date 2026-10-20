import { ApiProperty } from '@nestjs/swagger';
import { ReplyReactionKind } from '../../database/generated/client/client';

class ReplyReactionCountsDto {
  @ApiProperty({ example: 3 })
  readonly like!: number;

  @ApiProperty({ example: 0 })
  readonly dislike!: number;
}

/** The reply's counters after a reaction (section 9.2). */
export class ReplyReactionResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly replyId!: string;

  @ApiProperty({ type: () => ReplyReactionCountsDto })
  readonly counts!: ReplyReactionCountsDto;

  @ApiProperty({
    enum: Object.values(ReplyReactionKind),
    isArray: true,
    description: 'Empty when the viewer has none.',
  })
  readonly viewerReactions!: readonly ReplyReactionKind[];
}
