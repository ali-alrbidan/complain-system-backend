// import { Module } from '@nestjs/common';
// import { AppController } from './app.controller';
// import { ConfigModule } from '@nestjs/config';
// import { AppService } from './app.service';
// import { ScheduleModule } from '@nestjs/schedule';
// import { AuthModule } from './auth/auth.module';
// import { UsersModule } from './users/users.module';
// import { ComplaintsModule } from './complaints/complaints.module';
// import { DepartmentsModule } from './departments/departments.module';
// import { NotificationsModule } from './notifications/notifications.module';
// import { PrismaModule } from './prisma/prisma.module';

// @Module({
//   imports: [
//     ConfigModule.forRoot({
//       isGlobal: true,
//     }),
//     ScheduleModule.forRoot(),
//     AuthModule,
//     UsersModule,
//     ComplaintsModule,
//     DepartmentsModule,
//     NotificationsModule,
//     PrismaModule,
//   ],
//   controllers: [AppController],
//   providers: [AppService],
// })
// export class AppModule {}

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './app.service';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { DepartmentsModule } from './departments/departments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { CustomThrottlerGuard } from './auth/guards/throttle.guard';
import { BackupModule } from './backup/backup.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 دقيقة
        limit: 1000, // 10 طلبات
      },
    ]),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    ComplaintsModule,
    DepartmentsModule,
    NotificationsModule,
    PrismaModule,
    BackupModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule {}
