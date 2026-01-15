// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import * as dotenv from 'dotenv';
// import { ValidationPipe } from '@nestjs/common';

// dotenv.config();

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);
//   app.useGlobalPipes(
//     new ValidationPipe({
//       whitelist: true,
//       forbidNonWhitelisted: true,
//       transform: true,
//     }),
//   );
//   // تفعيل CORS
//   app.enableCors();

//   // تحديد البادئة للـ API
//   app.setGlobalPrefix('api');

//   await app.listen(3000);
//   console.log('the app is working on  http://localhost:3000/api');
// }
// bootstrap();

// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import * as dotenv from 'dotenv';
// import { ValidationPipe } from '@nestjs/common';
// import * as express from 'express';
// import { join } from 'path';

// dotenv.config();

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);
//   app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

//   app.useGlobalPipes(
//     new ValidationPipe({
//       whitelist: true,
//       forbidNonWhitelisted: true,
//       transform: true,
//     }),
//   );

//   app.enableCors();
//   app.setGlobalPrefix('api');

//   await app.listen(3000);
//   console.log('Server running on: http://localhost:3000/api');
// }
// bootstrap();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';
import { AuditLoggingInterceptor } from './common/interceptors/audit-logging.interceptor';
import { PrismaService } from './prisma/prisma.service';
import { PerformanceLoggingInterceptor } from './common/interceptors/performance-logging.interceptor';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(
    new AuditLoggingInterceptor(app.get(PrismaService)),
    new PerformanceLoggingInterceptor(),
  );

  app.enableCors();
  app.setGlobalPrefix('api');

  await app.listen(3000);
  console.log('Server running on: http://localhost:3000/api');
}
bootstrap();
