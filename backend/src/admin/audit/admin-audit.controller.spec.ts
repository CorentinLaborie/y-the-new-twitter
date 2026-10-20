import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminAuditController } from './admin-audit.controller';
import { AuditListQueryDto } from './admin-audit.dto';
import type { AuditLogService } from './audit-log.service';
import type { AuditPage, AuditVerification } from './audit-log.types';

async function queryErrors(plain: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(AuditListQueryDto, plain));
  return errors.map((error) => error.property);
}

describe('AdminAuditController', () => {
  const page: AuditPage = {
    items: [
      {
        id: 'e1',
        actorId: 'u1',
        action: 'auth.admin_login',
        result: 'ok',
        targetType: 'user',
        targetId: 'u1',
        reason: null,
        details: null,
        createdAt: '2026-10-20T10:00:00.000Z',
      },
    ],
    nextCursor: 'c1',
  };
  const verification: AuditVerification = { valid: true, brokenAt: null, checked: 1 };

  let service: { list: jest.Mock; verify: jest.Mock };
  let controller: AdminAuditController;

  beforeEach(() => {
    service = { list: jest.fn().mockResolvedValue(page), verify: jest.fn().mockResolvedValue(verification) };
    controller = new AdminAuditController(service as unknown as AuditLogService);
  });

  it('passes the cursor, the limit and the action to the service and returns its page unchanged', async () => {
    const query = plainToInstance(AuditListQueryDto, { cursor: 'c0', limit: 20, action: 'auth.admin_login' });

    const result = await controller.list(query);

    expect(service.list).toHaveBeenCalledWith({ cursor: 'c0', limit: 20, action: 'auth.admin_login' });
    expect(result).toBe(page);
  });

  it('returns the result of the chain check unchanged', async () => {
    const result = await controller.verify();

    expect(service.verify).toHaveBeenCalledTimes(1);
    expect(result).toBe(verification);
  });

  it('defaults the limit to 20 when it is absent', async () => {
    const query = plainToInstance(AuditListQueryDto, {});

    expect(await validate(query)).toHaveLength(0);
    expect(query.limit).toBe(20);
  });

  it('accepts a limit of 50, the maximum', async () => {
    expect(await queryErrors({ limit: 50 })).toEqual([]);
  });

  it('refuses a limit of 51 and an unknown action, and accepts a known action', async () => {
    expect(await queryErrors({ limit: 51 })).toEqual(['limit']);
    expect(await queryErrors({ action: 'auth.unknown' })).toEqual(['action']);
    expect(await queryErrors({ action: 'auth.admin_login' })).toEqual([]);
  });

  it('accepts a string-typed limit from the URL and converts it to a number', async () => {
    const query = plainToInstance(AuditListQueryDto, { limit: '20' });

    expect(await validate(query)).toHaveLength(0);
    expect(query.limit).toBe(20);
  });
});
