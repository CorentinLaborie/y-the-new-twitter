import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminAccountDeletionDto } from './admin-account-deletion.dto';

async function errorsOf(plain: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(AdminAccountDeletionDto, plain));
  return errors.map((error) => error.property);
}

describe('AdminAccountDeletionDto', () => {
  it('accepts each listed reason without a text', async () => {
    for (const reasonCode of ['abuse', 'spam', 'harassment', 'identity_theft']) {
      expect(await errorsOf({ reasonCode })).toEqual([]);
    }
  });

  it('refuses a reason that is not in the list, and a missing reason', async () => {
    expect(await errorsOf({ reasonCode: 'ennui' })).toEqual(['reasonCode']);
    expect(await errorsOf({})).toEqual(['reasonCode']);
  });

  it('requires a text for "Autre"', async () => {
    expect(await errorsOf({ reasonCode: 'other' })).toEqual(['otherReason']);
    expect(await errorsOf({ reasonCode: 'other', otherReason: '   ' })).toEqual(['otherReason']);
    expect(await errorsOf({ reasonCode: 'other', otherReason: 'Compte piraté' })).toEqual([]);
  });

  it('trims the text of "Autre"', () => {
    const dto = plainToInstance(AdminAccountDeletionDto, {
      reasonCode: 'other',
      otherReason: '  Compte piraté ',
    });

    expect(dto.otherReason).toBe('Compte piraté');
  });

  it('refuses a text longer than 500 characters', async () => {
    expect(await errorsOf({ reasonCode: 'other', otherReason: 'a'.repeat(501) })).toEqual(['otherReason']);
    expect(await errorsOf({ reasonCode: 'other', otherReason: 'a'.repeat(500) })).toEqual([]);
  });

  it('ignores the text for a listed reason', async () => {
    expect(await errorsOf({ reasonCode: 'spam', otherReason: '   ' })).toEqual([]);
  });
});
