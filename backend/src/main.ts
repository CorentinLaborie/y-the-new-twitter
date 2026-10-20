import { createApplication } from './create-application';

async function bootstrap(): Promise<void> {
  const app = await createApplication();

  await app.listen(Number(process.env.PORT ?? 8080));
}

void bootstrap();
