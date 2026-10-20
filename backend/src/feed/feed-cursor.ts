import { BadRequestException } from '@nestjs/common';

/** The last row of a page, which the next page starts after (ordered by createdAt, ties broken by id). */
export interface CursorPosition {
  readonly createdAt: Date;
  readonly id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVALID_CURSOR = 'Curseur invalide.';

/** An opaque cursor: base64url of "<createdAt ISO 8601>|<row id>". */
export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(`${position.createdAt.toISOString()}|${position.id}`).toString('base64url');
}

export function decodeCursor(cursor: string): CursorPosition {
  const [created, id, ...rest] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(created ?? '');
  if (rest.length > 0 || id === undefined || !UUID_PATTERN.test(id) || Number.isNaN(createdAt.getTime())) {
    throw new BadRequestException(INVALID_CURSOR);
  }

  return { createdAt, id };
}
