import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // تفعيل CORS
  app.enableCors();

  // تحديد البادئة للـ API
  app.setGlobalPrefix('api');

  await app.listen(3000);
  console.log('the app is working on  http://localhost:3000/api');
}
bootstrap();
