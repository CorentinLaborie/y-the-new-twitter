import { ApiProperty } from '@nestjs/swagger';

/** Who did the action, or null for a system notification. */
export class NotificationActorDto {
  @ApiProperty({ example: 'bob' })
  readonly handle!: string;

  @ApiProperty({ example: 'Bob' })
  readonly displayName!: string;
}

/** A question or a reply a notification refers to. */
export class NotificationTargetDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ example: 'Une question ?' })
  readonly text!: string;
}

/** One notification. Reactions of the same kind on the same question are one line, with `actorCount` actors. */
export class NotificationViewDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({
    enum: [
      'reply_to_question',
      'conversation_opened',
      'reaction_like',
      'reaction_dislike',
      'reaction_y',
      'follow',
      'mention',
    ],
  })
  readonly type!: string;

  @ApiProperty({ format: 'date-time' })
  readonly createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Null while the line is unread.' })
  readonly readAt!: string | null;

  @ApiProperty({ type: () => NotificationActorDto, nullable: true })
  readonly actor!: NotificationActorDto | null;

  @ApiProperty({ example: 1, minimum: 1 })
  readonly actorCount!: number;

  @ApiProperty({ type: () => NotificationTargetDto, nullable: true })
  readonly question!: NotificationTargetDto | null;

  @ApiProperty({ type: () => NotificationTargetDto, nullable: true })
  readonly reply!: NotificationTargetDto | null;
}

/** One page of notifications, newest first. `nextCursor` is null on the last page. */
export class NotificationPageDto {
  @ApiProperty({ type: () => [NotificationViewDto] })
  readonly items!: readonly NotificationViewDto[];

  @ApiProperty({ type: String, nullable: true, example: 'MjAyNi0xMC0yMlQxMDowMDowMC4wMDBafDBmOGMxZDJlLTNhNGItNGM1ZC04ZTZmLTdhOGI5YzBkMWUyZg' })
  readonly nextCursor!: string | null;
}

/** Number of unread lines (a reaction group counts once). */
export class UnreadCountDto {
  @ApiProperty({ example: 3, minimum: 0 })
  readonly unread!: number;
}
