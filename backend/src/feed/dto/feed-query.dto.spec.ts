import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FeedQueryDto } from './feed-query.dto';

async function tabErrors(tab: unknown): Promise<string[]> {
  const errors = await validate(plainToInstance(FeedQueryDto, { tab }));
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('FeedQueryDto.tab', () => {
  it('accepts the "Pour vous" tab and the "Abonnements" tab', async () => {
    expect(await tabErrors('for-you')).toEqual([]);
    expect(await tabErrors('following')).toEqual([]);
  });

  it('refuses any other tab, with a message that names both tabs', async () => {
    for (const tab of ['trending', 'Following', 'for_you', '', undefined]) {
      const errors = await tabErrors(tab);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('« for-you » et « following »');
    }
  });
});
