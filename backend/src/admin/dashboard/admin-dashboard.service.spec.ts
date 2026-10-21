import type { AdminDashboardRepository } from './admin-dashboard.repository';
import { AdminDashboardService } from './admin-dashboard.service';

const NOW = new Date('2026-10-21T10:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('AdminDashboardService.view', () => {
  let repository: {
    openReportCount: jest.Mock;
    oldestOpenReportAt: jest.Mock;
    averageHandlingSeconds: jest.Mock;
    pendingDeletionCount: jest.Mock;
    nextPurgeAt: jest.Mock;
  };
  let service: AdminDashboardService;

  beforeEach(() => {
    repository = {
      openReportCount: jest.fn().mockResolvedValue(4),
      oldestOpenReportAt: jest.fn().mockResolvedValue(new Date('2026-10-13T11:07:00.000Z')),
      averageHandlingSeconds: jest.fn().mockResolvedValue(93840.4),
      pendingDeletionCount: jest.fn().mockResolvedValue(1),
      nextPurgeAt: jest.fn().mockResolvedValue(new Date('2026-12-31T00:00:00.000Z')),
    };
    service = new AdminDashboardService(repository as unknown as AdminDashboardRepository);
  });

  it('returns the indicators, with the dates as ISO strings and the handling time in whole seconds', async () => {
    await expect(service.view(NOW)).resolves.toEqual({
      openReportCount: 4,
      oldestOpenReportAt: '2026-10-13T11:07:00.000Z',
      averageHandlingSeconds: 93840,
      pendingDeletionCount: 1,
      nextPurgeAt: '2026-12-31T00:00:00.000Z',
    });
  });

  it('averages the reports decided in the last 30 days', async () => {
    await service.view(NOW);

    expect(repository.averageHandlingSeconds).toHaveBeenCalledWith(new Date(NOW.getTime() - 30 * DAY_MS));
  });

  it('gives null for the dates and the handling time when there is nothing to count', async () => {
    repository.oldestOpenReportAt.mockResolvedValueOnce(null);
    repository.averageHandlingSeconds.mockResolvedValueOnce(null);
    repository.nextPurgeAt.mockResolvedValueOnce(null);
    repository.openReportCount.mockResolvedValueOnce(0);

    await expect(service.view(NOW)).resolves.toEqual({
      openReportCount: 0,
      oldestOpenReportAt: null,
      averageHandlingSeconds: null,
      pendingDeletionCount: 1,
      nextPurgeAt: null,
    });
  });
});
