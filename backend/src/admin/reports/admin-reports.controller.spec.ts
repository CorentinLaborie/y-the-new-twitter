import { ADMIN_REAUTH_KEY } from '../admin.decorators';
import { AdminReportsController } from './admin-reports.controller';
import type { AdminReportsService } from './admin-reports.service';

const ADMIN = { id: '9d0c1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f' };
const REPORT_ID = '2c1d0e9f-8a7b-4c6d-9e5f-1a2b3c4d5e6f';

describe('AdminReportsController', () => {
  it('needs a re-authentication to decide on a report (DEC-088)', () => {
    expect(Reflect.getMetadata(ADMIN_REAUTH_KEY, AdminReportsController.prototype.decide)).toBe(true);
  });

  it('does not need a re-authentication to read the reports', () => {
    expect(Reflect.getMetadata(ADMIN_REAUTH_KEY, AdminReportsController.prototype.list)).toBe(false);
    expect(Reflect.getMetadata(ADMIN_REAUTH_KEY, AdminReportsController.prototype.view)).toBe(false);
  });

  it('passes the filters and the page to the service', async () => {
    const service = { list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }) };
    const controller = new AdminReportsController(service as unknown as AdminReportsService);

    await controller.list({ status: 'open', reason: 'spam', limit: 10 } as never);

    expect(service.list).toHaveBeenCalledWith({
      status: 'open',
      reason: 'spam',
      cursor: undefined,
      limit: 10,
    });
  });

  it('passes the administrator, the report, the decision and the note to the service', async () => {
    const service = { decide: jest.fn().mockResolvedValue({ id: REPORT_ID }) };
    const controller = new AdminReportsController(service as unknown as AdminReportsService);

    await controller.decide(
      REPORT_ID,
      { decision: 'dismiss', note: 'Pas de règle enfreinte' } as never,
      ADMIN as never,
    );

    expect(service.decide).toHaveBeenCalledWith(
      ADMIN.id,
      REPORT_ID,
      { decision: 'dismiss', note: 'Pas de règle enfreinte' },
      expect.any(Date),
    );
  });

  it('passes the report id to the service when a report is read', async () => {
    const service = { view: jest.fn().mockResolvedValue({ id: REPORT_ID }) };
    const controller = new AdminReportsController(service as unknown as AdminReportsService);

    await controller.view(REPORT_ID);

    expect(service.view).toHaveBeenCalledWith(REPORT_ID);
  });
});
