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
  // A full log batch (100 entries with stacks) is well over Express's 100 KB default.
  app.useBodyParser('json', { limit: '2mb' });
  const config = app.get<Config>(CONFIG);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          styleSrc: ["'unsafe-inline'"],
          imgSrc: ["'self'"],
          scriptSrc: ["'self'"],
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
