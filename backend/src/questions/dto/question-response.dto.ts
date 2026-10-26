import { ApiProperty } from '@nestjs/swagger';

class QuestionAuthorDto {
  @ApiProperty({ example: 'alice' })
  readonly handle!: string;

  @ApiProperty({ example: 'Alice' })
  readonly displayName!: string;

  @ApiProperty({
    example: false,
    description: 'True when the signed-in viewer follows this author. False for the viewer’s own questions (L3).',
  })
  readonly viewerFollows!: boolean;
}

class QuestionCountersDto {
  @ApiProperty({ example: 0 })
  readonly like!: number;

  @ApiProperty({ example: 0 })
  readonly dislike!: number;

  @ApiProperty({ example: 0 })
  readonly y!: number;

  @ApiProperty({ example: 0 })
  readonly reply!: number;
}

/** A question as the API returns it. Times are ISO 8601 in UTC (section 9.1). */
export class QuestionResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ maxLength: 280 })
  readonly text!: string;

  @ApiProperty({ format: 'date-time' })
  readonly createdAt!: string;

  @ApiProperty({ type: () => QuestionAuthorDto })
  readonly author!: QuestionAuthorDto;

  @ApiProperty({ type: [String], example: ['online_life'], description: 'Without the #, lowercase.' })
  readonly hashtags!: readonly string[];

  @ApiProperty({ type: () => QuestionCountersDto })
  readonly counters!: QuestionCountersDto;

  @ApiProperty({
    example: 50,
    description: 'Y_CONVERSATION_THRESHOLD: the Y count that opens the conversation (R3).',
  })
  readonly yThreshold!: number;

  @ApiProperty({
    example: false,
    description: 'True once the Y count has reached yThreshold. It stays true if the count drops (R13).',
  })
  readonly conversationOpen!: boolean;

  @ApiProperty({
    type: [String],
    enum: ['like', 'dislike', 'y'],
    maxItems: 1,
    description:
      'The reaction of the signed-in viewer on this question, at most one (R11). Empty for anonymous views.',
  })
  readonly viewerReactions!: readonly string[];

  @ApiProperty({
    description:
      'Whether the signed-in viewer saved this question (L4, section 9.2). False for anonymous views and for the question just published.',
  })
  readonly viewerSaved!: boolean;
}
