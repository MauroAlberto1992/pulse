// Must stay first: loads .env before the config is read (a no-op on Railway, which sets real env vars).
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { CONFIG, Config } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<Config>(CONFIG);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          styleSrc: ["'unsafe-inline'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
        },
      },
    }),
  );
  // Railway terminates TLS in front of the service; needed for Secure cookies.
  if (config.production) {
    app.set('trust proxy', 1);
  }
  app.enableShutdownHooks();
  await app.listen(config.port);
}
void bootstrap();
