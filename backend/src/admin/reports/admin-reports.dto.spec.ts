import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReportDecisionDto, ReportListQueryDto } from './admin-reports.dto';

async function errorsOf(cls: new () => object, plain: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, plain));
  return errors.map((error) => error.property);
}

describe('ReportListQueryDto', () => {
  it('accepts no filter, the open or the decided status, and a known reason', async () => {
    expect(await errorsOf(ReportListQueryDto, {})).toEqual([]);
    expect(await errorsOf(ReportListQueryDto, { status: 'open' })).toEqual([]);
    expect(await errorsOf(ReportListQueryDto, { status: 'decided', reason: 'illegal_content' })).toEqual([]);
  });

  it('refuses an unknown status and an unknown reason', async () => {
    expect(await errorsOf(ReportListQueryDto, { status: 'resolved' })).toEqual(['status']);
    expect(await errorsOf(ReportListQueryDto, { reason: 'ennui' })).toEqual(['reason']);
  });

  it('gives the first page of 20 reports when no limit is sent, and refuses a limit above 50', async () => {
    expect(plainToInstance(ReportListQueryDto, {}).limit).toBe(20);
    expect(await errorsOf(ReportListQueryDto, { limit: 51 })).toEqual(['limit']);
    expect(await errorsOf(ReportListQueryDto, { limit: 0 })).toEqual(['limit']);
  });
});

describe('ReportDecisionDto', () => {
  it('accepts the hide and the dismiss decisions, each with a note', async () => {
    expect(await errorsOf(ReportDecisionDto, { decision: 'hide', note: 'Injure' })).toEqual([]);
    expect(
      await errorsOf(ReportDecisionDto, { decision: 'dismiss', note: 'Pas de règle enfreinte' }),
    ).toEqual([]);
  });

  it('refuses any other decision', async () => {
    expect(await errorsOf(ReportDecisionDto, { decision: 'restore', note: 'Injure' })).toEqual(['decision']);
    expect(await errorsOf(ReportDecisionDto, { note: 'Injure' })).toEqual(['decision']);
  });

  it('refuses a decision without a note, for both decisions', async () => {
    expect(await errorsOf(ReportDecisionDto, { decision: 'hide' })).toEqual(['note']);
    expect(await errorsOf(ReportDecisionDto, { decision: 'dismiss' })).toEqual(['note']);
  });

  it('refuses a blank note, the same as a missing one', async () => {
    expect(await errorsOf(ReportDecisionDto, { decision: 'hide', note: '' })).toEqual(['note']);
    expect(await errorsOf(ReportDecisionDto, { decision: 'hide', note: '   ' })).toEqual(['note']);
  });

  it('trims the note', () => {
    expect(plainToInstance(ReportDecisionDto, { decision: 'hide', note: '  Injure  ' }).note).toBe('Injure');
  });

  it('refuses a note longer than 500 characters', async () => {
    expect(await errorsOf(ReportDecisionDto, { decision: 'hide', note: 'a'.repeat(501) })).toEqual(['note']);
    expect(await errorsOf(ReportDecisionDto, { decision: 'hide', note: 'a'.repeat(500) })).toEqual([]);
  });
});
