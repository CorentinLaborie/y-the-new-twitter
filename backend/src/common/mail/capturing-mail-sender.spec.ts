import { CapturingMailSender } from './capturing-mail-sender';

describe('CapturingMailSender', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('records a message and reads it back', async () => {
    const sender = new CapturingMailSender();

    await sender.send({ to: 'alice@example.test', subject: 'Code', text: '123456', html: '<p>123456</p>' });

    expect(sender.messages()).toEqual([
      { to: 'alice@example.test', subject: 'Code', text: '123456', html: '<p>123456</p>' },
    ]);
  });

  it('keeps the messages in the order they were sent', async () => {
    const sender = new CapturingMailSender();

    await sender.send({ to: 'a@example.test', subject: 'First', text: '1' });
    await sender.send({ to: 'b@example.test', subject: 'Second', text: '2' });

    expect(sender.messages().map((mail) => mail.subject)).toEqual(['First', 'Second']);
  });

  it('returns copies, so a caller cannot change the recorded message', async () => {
    const sender = new CapturingMailSender();
    await sender.send({ to: 'a@example.test', subject: 'Code', text: '123456' });

    sender.messages()[0].text = 'changed';

    expect(sender.messages()[0].text).toBe('123456');
  });

  it('clears the outbox', async () => {
    const sender = new CapturingMailSender();
    await sender.send({ to: 'a@example.test', subject: 'Code', text: '123456' });

    sender.clear();

    expect(sender.messages()).toEqual([]);
  });

  it('refuses to run in production', async () => {
    process.env.NODE_ENV = 'production';
    const sender = new CapturingMailSender();

    await expect(sender.send({ to: 'a@example.test', subject: 'Code', text: '123456' })).rejects.toThrow(
      'cannot run in production',
    );
  });
});
