import { BrevoMailSender } from './brevo-mail-sender';

/** A fake HTTP client: nothing leaves the test process. */
function fakeFetch(response: Response | Error) {
  return jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () => {
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
}

const mail = {
  to: 'alice@example.test',
  subject: 'Votre code Y',
  text: 'Votre code : 482913',
  html: '<p>Votre code : 482913</p>',
};

describe('BrevoMailSender (fake HTTP, never called for real)', () => {
  const apiKey = 'test-brevo-key';
  const fromAddress = 'no-reply@example.test';

  it('posts the message to the Brevo transactional endpoint with the API key', async () => {
    const fetchImpl = fakeFetch(new Response('{"messageId":"<1@brevo>"}', { status: 201 }));
    const sender = new BrevoMailSender({ apiKey, fromAddress, fetchImpl });

    await sender.send(mail);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    });
  });

  it('sends the sender address, the recipient, the subject and both bodies', async () => {
    const fetchImpl = fakeFetch(new Response(null, { status: 201 }));
    const sender = new BrevoMailSender({ apiKey, fromAddress, fetchImpl });

    await sender.send(mail);

    const body = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string);
    expect(body).toEqual({
      sender: { email: fromAddress },
      to: [{ email: 'alice@example.test' }],
      subject: 'Votre code Y',
      textContent: 'Votre code : 482913',
      htmlContent: '<p>Votre code : 482913</p>',
    });
  });

  it('omits htmlContent when the message has no HTML part', async () => {
    const fetchImpl = fakeFetch(new Response(null, { status: 201 }));
    const sender = new BrevoMailSender({ apiKey, fromAddress, fetchImpl });

    await sender.send({ to: 'alice@example.test', subject: 'Code', text: '123456' });

    const body = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string);
    expect(body).not.toHaveProperty('htmlContent');
  });

  it('sets a timeout on the request', async () => {
    const fetchImpl = fakeFetch(new Response(null, { status: 201 }));
    const sender = new BrevoMailSender({ apiKey, fromAddress, fetchImpl });

    await sender.send(mail);

    expect(fetchImpl.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws on a refused message, without the response body, the recipient or the code', async () => {
    const fetchImpl = fakeFetch(
      new Response('{"message":"alice@example.test rejected, code 482913"}', { status: 400 }),
    );
    const sender = new BrevoMailSender({ apiKey, fromAddress, fetchImpl });

    const error = await sender.send(mail).catch((thrown: Error) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Brevo refused the message with HTTP 400.');
    expect((error as Error).message).not.toMatch(/alice|482913|test-brevo-key/);
  });

  it('throws on a server error', async () => {
    const fetchImpl = fakeFetch(new Response(null, { status: 503 }));
    const sender = new BrevoMailSender({ apiKey, fromAddress, fetchImpl });

    await expect(sender.send(mail)).rejects.toThrow('HTTP 503');
  });

  it('lets a network failure propagate', async () => {
    const fetchImpl = fakeFetch(new TypeError('fetch failed'));
    const sender = new BrevoMailSender({ apiKey, fromAddress, fetchImpl });

    await expect(sender.send(mail)).rejects.toThrow('fetch failed');
  });
});
