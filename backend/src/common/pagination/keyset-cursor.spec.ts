import { BadRequestException } from '@nestjs/common';
import { decodeKeysetCursor, encodeKeysetCursor } from './keyset-cursor';

const ID = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';

describe('keyset cursor', () => {
  it('reads back the position it encoded', () => {
    const position = { createdAt: new Date('2026-10-20T12:00:00.123Z'), id: ID };

    expect(decodeKeysetCursor(encodeKeysetCursor(position))).toEqual(position);
  });

  it('refuses a value that is not a cursor, with 400', () => {
    for (const value of ['garbage', '', encodeKeysetCursor({ createdAt: new Date(), id: 'not-a-uuid' })]) {
      expect(() => decodeKeysetCursor(value)).toThrow(BadRequestException);
    }
  });
});
