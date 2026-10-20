import { BadRequestException } from '@nestjs/common';

/** The position after which a keyset page starts: a creation time, then an id, the order of the listings. */
export interface KeysetPosition {
  createdAt: Date;
  id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The cursor is the position of the last row of the page, in base64url JSON. The client keeps it as it is. */
export function encodeKeysetCursor(position: KeysetPosition): string {
  return Buffer.from(
    JSON.stringify({ t: position.createdAt.toISOString(), i: position.id }),
    'utf8',
  ).toString('base64url');
}

/** Reads a cursor made by encodeKeysetCursor. Any other value is refused with 400. */
export function decodeKeysetCursor(cursor: string): KeysetPosition {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      t?: unknown;
      i?: unknown;
    };
    if (
      typeof value.t === 'string' &&
      typeof value.i === 'string' &&
      UUID_PATTERN.test(value.i) &&
      !Number.isNaN(Date.parse(value.t))
    ) {
      return { createdAt: new Date(value.t), id: value.i };
    }
  } catch {
    // Handled below: any value that is not a valid cursor is refused the same way.
  }

  throw new BadRequestException('Curseur invalide.');
}
