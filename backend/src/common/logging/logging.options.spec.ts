import pino from 'pino';
import { loggingOptions } from './logging.options';

/** The redaction of section 13: a code or a password never reaches a log line, even when a log line carries one. */
describe('Log redaction (B23)', () => {
  function logLines(write: (logger: pino.Logger) => void): string {
    const lines: string[] = [];
    const { redact } = loggingOptions.pinoHttp as pino.LoggerOptions;
    const logger = pino(
      { redact },
      {
        write: (line: string) => {
          lines.push(line);
        },
      },
    );
    write(logger);
    return lines.join('');
  }

  it('redacts a verification code and a password one level below the log object', () => {
    const output = logLines((logger) =>
      logger.info({ data: { code: '482913', password: 'Secret1234!' } }, 'verification'),
    );

    expect(output).not.toContain('482913');
    expect(output).not.toContain('Secret1234!');
    expect(output).toContain('[redacted]');
  });
});
