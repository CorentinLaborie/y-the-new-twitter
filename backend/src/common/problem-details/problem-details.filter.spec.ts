import { ArgumentsHost, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { ProblemDetailsFilter } from './problem-details.filter';

function hostFor(originalUrl: string) {
  const json = jest.fn();
  const setHeader = jest.fn().mockReturnValue({ json });
  const status = jest.fn().mockReturnValue({ setHeader });
  const request = { originalUrl, id: 'req-1' };
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;

  return { host, status, setHeader, json };
}

describe('ProblemDetailsFilter', () => {
  const filter = new ProblemDetailsFilter();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns an RFC 9457 body for a client error', () => {
    const { host, status, setHeader, json } = hostFor('/api/v1/missing');

    filter.catch(new NotFoundException('Route not found.'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
    expect(json).toHaveBeenCalledWith({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'Route not found.',
      instance: '/api/v1/missing',
      requestId: 'req-1',
    });
  });

  it('joins validation messages into one detail', () => {
    const { host, json } = hostFor('/api/v1/users');

    filter.catch(new BadRequestException(['a must be a string', 'b is unknown']), host);

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ status: 400, detail: 'a must be a string; b is unknown' }));
  });

  it('hides the message of an unexpected error and logs it', () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, status, json } = hostFor('/api/v1/users');

    filter.catch(new Error('database password is wrong'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ status: 500, detail: 'Unexpected error.' }));
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('database password is wrong'));
  });
});
