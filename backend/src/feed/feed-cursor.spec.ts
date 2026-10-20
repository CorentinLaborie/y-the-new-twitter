import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from './feed-cursor';

const POSITION = { createdAt: new Date('2026-10-20T10:41:00.123Z'), id: '0f8c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f' };

describe('feed cursor (B6)', () => {
  it('decodes what it encodes', () => {
    expect(decodeCursor(encodeCursor(POSITION))).toEqual(POSITION);
  });

  it('refuses a cursor that is not a position, with 400', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(BadRequestException);
    expect(() => decodeCursor(Buffer.from('2026-10-20T10:41:00.000Z|pas-un-uuid').toString('base64url'))).toThrow(
      BadRequestException,
    );
    expect(() => decodeCursor(Buffer.from('nope|' + POSITION.id).toString('base64url'))).toThrow(BadRequestException);
  });
});
