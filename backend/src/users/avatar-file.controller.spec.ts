import type { ConfigService } from '@nestjs/config';
import { AvatarFileController } from './avatar-file.controller';

const PHOTO = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d.jpg';

function fakes() {
  const config = { getOrThrow: jest.fn().mockReturnValue('/srv/y/avatars') };
  const response = {
    status: jest.fn().mockReturnThis(),
    end: jest.fn(),
    setHeader: jest.fn(),
    sendFile: jest.fn(),
    headersSent: false,
  };
  const controller = new AvatarFileController(config as unknown as ConfigService);

  return { response, controller };
}

describe('AvatarFileController', () => {
  it('answers 404 for a name that is not a stored photo, without reading the disk', () => {
    const { response, controller } = fakes();

    controller.serve('../secret.txt', response as never);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.sendFile).not.toHaveBeenCalled();
  });

  it('sends a stored photo with a one-day cache, an ETag and a cross-origin policy', () => {
    const { response, controller } = fakes();

    controller.serve(PHOTO, response as never);

    expect(response.setHeader).toHaveBeenCalledWith('Cross-Origin-Resource-Policy', 'cross-origin');
    expect(response.sendFile).toHaveBeenCalledWith(
      expect.stringContaining(PHOTO),
      expect.objectContaining({
        headers: { 'Cache-Control': 'public, max-age=86400, immutable' },
        etag: true,
      }),
      expect.any(Function),
    );
  });

  it('answers 404 when the file is gone, as for a deleted photo', () => {
    const { response, controller } = fakes();

    controller.serve(PHOTO, response as never);
    const onDone = response.sendFile.mock.calls[0][2] as (error: unknown) => void;
    onDone({ status: 404 });

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.end).toHaveBeenCalled();
  });

  it('does not answer twice when the headers were already sent', () => {
    const { response, controller } = fakes();
    response.headersSent = true;

    controller.serve(PHOTO, response as never);
    const onDone = response.sendFile.mock.calls[0][2] as (error: unknown) => void;
    onDone({ status: 404 });

    expect(response.status).not.toHaveBeenCalled();
  });
});
