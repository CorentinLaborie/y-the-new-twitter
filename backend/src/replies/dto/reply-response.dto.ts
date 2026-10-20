import { ApiProperty } from '@nestjs/swagger';
import { ReplyReactionKind } from '../../database/generated/client/client';

class ReplyCountersDto {
  @ApiProperty({ example: 3 })
  readonly like!: number;

  @ApiProperty({ example: 0 })
  readonly dislike!: number;
}

class ReplyAuthorDto {
  @ApiProperty({ example: 'alice' })
  readonly handle!: string;

  @ApiProperty({ example: 'Alice' })
  readonly displayName!: string;
}

/** A reply as the API returns it (section 9.2). `viewerReactions` lists the viewer's own kinds: both can be set (R2). */
export class ReplyResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  readonly questionId!: string;

  @ApiProperty({ maxLength: 280 })
  readonly text!: string;

  @ApiProperty({ format: 'date-time' })
  readonly createdAt!: string;

  @ApiProperty({ type: () => ReplyAuthorDto })
  readonly author!: ReplyAuthorDto;

  @ApiProperty({ type: () => ReplyCountersDto })
  readonly counters!: ReplyCountersDto;

  @ApiProperty({ enum: Object.values(ReplyReactionKind), isArray: true, description: 'Empty when the viewer has none.' })
  readonly viewerReactions!: readonly ReplyReactionKind[];
}
