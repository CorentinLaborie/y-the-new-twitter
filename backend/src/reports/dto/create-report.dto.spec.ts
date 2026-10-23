import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReportDto } from './create-report.dto';

const QUESTION_ID = '0f8c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

async function errorsOf(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateReportDto, body));

  return errors.map((error) => error.property);
}

describe('CreateReportDto (L6, S1)', () => {
  it('accepts a question target with a listed reason', async () => {
    expect(await errorsOf({ questionId: QUESTION_ID, reason: 'spam' })).toEqual([]);
  });

  it('refuses a reason outside the fixed list', async () => {
    expect(await errorsOf({ questionId: QUESTION_ID, reason: 'rude' })).toEqual(['reason']);
  });

  it('refuses a target that is not a UUID', async () => {
    expect(await errorsOf({ questionId: 'not-a-uuid', reason: 'spam' })).toEqual(['questionId']);
  });

  it('trims the details', () => {
    const dto = plainToInstance(CreateReportDto, { questionId: QUESTION_ID, reason: 'other', details: '  Texte  ' });

    expect(dto.details).toBe('Texte');
  });
});
