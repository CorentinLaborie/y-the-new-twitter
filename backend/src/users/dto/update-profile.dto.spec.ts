import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';

async function errorsOf(input: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(UpdateProfileDto, input));
  return errors.map((error) => error.property);
}

describe('UpdateProfileDto (plan L1, 1.1)', () => {
  it('accepts an empty body, which changes nothing', async () => {
    expect(await errorsOf({})).toEqual([]);
  });

  it('accepts a valid handle, display name and bio', async () => {
    expect(await errorsOf({ handle: 'Alice_01', displayName: 'Alice Martin', bio: 'Bonjour' })).toEqual([]);
  });

  it('accepts a null bio, which clears it', async () => {
    expect(await errorsOf({ bio: null })).toEqual([]);
  });

  it('refuses a handle longer than 30 characters', async () => {
    expect(await errorsOf({ handle: 'a'.repeat(31) })).toEqual(['handle']);
  });

  it('refuses a handle with a character outside letters, digits and underscore', async () => {
    expect(await errorsOf({ handle: 'alice-martin' })).toEqual(['handle']);
    expect(await errorsOf({ handle: 'alice é' })).toEqual(['handle']);
  });

  it('refuses a reserved handle, whatever its case', async () => {
    const reserved = await errorsOf({ handle: 'Admin' });
    expect(reserved).toEqual(['handle']);
  });

  it('refuses an empty display name and one longer than 50 characters', async () => {
    expect(await errorsOf({ displayName: '' })).toEqual(['displayName']);
    expect(await errorsOf({ displayName: 'a'.repeat(51) })).toEqual(['displayName']);
  });

  it('refuses a bio longer than 160 characters', async () => {
    expect(await errorsOf({ bio: 'a'.repeat(161) })).toEqual(['bio']);
  });
});
