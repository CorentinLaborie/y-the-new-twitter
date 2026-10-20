import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AccountListQueryDto } from './admin-users.dto';

async function queryErrors(plain: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(AccountListQueryDto, plain));
  return errors.map((error) => error.property);
}

describe('AccountListQueryDto', () => {
  it('defaults the limit to 20 when it is absent, and accepts 50, the maximum', async () => {
    const query = plainToInstance(AccountListQueryDto, {});

    expect(await validate(query)).toHaveLength(0);
    expect(query.limit).toBe(20);
    expect(await queryErrors({ limit: 50 })).toEqual([]);
    expect(await queryErrors({ limit: 51 })).toEqual(['limit']);
  });

  it('treats a blank search as absent', () => {
    const query = plainToInstance(AccountListQueryDto, { q: '   ' });

    expect(query.q).toBeUndefined();
  });

  it('trims the search and refuses one longer than an e-mail address can be', async () => {
    const query = plainToInstance(AccountListQueryDto, { q: '  demo_alice  ' });

    expect(query.q).toBe('demo_alice');
    expect(await queryErrors({ q: 'a'.repeat(255) })).toEqual(['q']);
  });

  it('accepts a known status and refuses an unknown one', async () => {
    expect(await queryErrors({ status: 'suspended' })).toEqual([]);
    expect(await queryErrors({ status: 'banned' })).toEqual(['status']);
  });
});
