import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnv } from './env';
import { initSentry } from './instrument';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const env = validateEnv();
  initSentry(env.SENTRY_DSN);

  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  app.enableCors({
    origin: env.WEB_URL,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  app.setGlobalPrefix('api/v1');

  await app.listen(env.PORT);
  if (env.NODE_ENV !== 'production') {
    Logger.log(`API running on http://localhost:${env.PORT}`, 'Bootstrap');
  }
}
bootstrap();
