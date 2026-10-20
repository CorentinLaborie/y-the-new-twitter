import { ApiProperty } from '@nestjs/swagger';
import { ReactionKind } from '../../database/generated/client/client';

class ReactionCountsDto {
  @ApiProperty({ example: 124 })
  readonly like!: number;

  @ApiProperty({ example: 12 })
  readonly dislike!: number;

  @ApiProperty({ example: 49 })
  readonly y!: number;
}

/** The question's counters after a reaction (section 9.3). A viewer has at most one reaction (R11). */
export class ReactionResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly questionId!: string;

  @ApiProperty({ type: () => ReactionCountsDto })
  readonly counts!: ReactionCountsDto;

  @ApiProperty({ enum: Object.values(ReactionKind), isArray: true, description: 'Empty when the viewer has no reaction.' })
  readonly viewerReactions!: readonly ReactionKind[];

  @ApiProperty({ example: 50, description: 'Y_CONVERSATION_THRESHOLD: the Y count that opens the conversation (R3).' })
  readonly yThreshold!: number;

  @ApiProperty({ example: true, description: 'True once the Y count has reached yThreshold (R13).' })
  readonly conversationOpen!: boolean;
}
