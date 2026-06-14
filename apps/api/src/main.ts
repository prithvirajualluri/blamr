import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  });
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`blamr API listening on port ${port}`);
}

bootstrap();
