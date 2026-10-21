import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SupportListQueryDto, SupportReplyDto } from './admin-support.dto';

async function errorsOf(cls: new () => object, plain: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, plain));
  return errors.map((error) => error.property);
}

describe('SupportListQueryDto', () => {
  it('accepts the open and the closed statuses, and no filter', async () => {
    expect(await errorsOf(SupportListQueryDto, {})).toEqual([]);
    expect(await errorsOf(SupportListQueryDto, { status: 'open' })).toEqual([]);
    expect(await errorsOf(SupportListQueryDto, { status: 'closed' })).toEqual([]);
  });

  it('refuses any other status, and a limit above 50', async () => {
    expect(await errorsOf(SupportListQueryDto, { status: 'new' })).toEqual(['status']);
    expect(await errorsOf(SupportListQueryDto, { limit: 51 })).toEqual(['limit']);
  });
});

describe('SupportReplyDto', () => {
  it('trims the answer', () => {
    expect(plainToInstance(SupportReplyDto, { text: '  Votre demande est reçue.  ' }).text).toBe(
      'Votre demande est reçue.',
    );
  });

  it('refuses a missing or blank answer', async () => {
    expect(await errorsOf(SupportReplyDto, {})).toEqual(['text']);
    expect(await errorsOf(SupportReplyDto, { text: '   ' })).toEqual(['text']);
  });

  it('accepts an answer of 1000 characters, and refuses 1001', async () => {
    expect(await errorsOf(SupportReplyDto, { text: 'a'.repeat(1000) })).toEqual([]);
    expect(await errorsOf(SupportReplyDto, { text: 'a'.repeat(1001) })).toEqual(['text']);
  });
});
