// src/notifications/notifications.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from 'generated/prisma/enums';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { QueryNotificationDto } from './dto/query-notification.dto';
import { MarkAllAsReadDto } from './dto/mark-all-as-read.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  // إنشاء إشعار (للمشرف أو النظام)
  @Post()
  @Roles(UserRole.ADMIN)
  async create(@Body() createNotificationDto: CreateNotificationDto) {
    const notification = await this.notificationsService.create(
      createNotificationDto,
    );

    // إرسال الإشعار عبر WebSocket
    await this.notificationsGateway.sendNotificationToUser(
      notification.userId,
      notification,
    );

    return {
      message: 'تم إنشاء الإشعار بنجاح',
      notification,
    };
  }

  // جلب جميع إشعارات المستخدم الحالي
  @Get()
  findAll(@CurrentUser() user: any, @Query() query: QueryNotificationDto) {
    return this.notificationsService.findAllForUser(user.id, query);
  }

  // جلب عدد الإشعارات غير المقروءة
  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: any) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  // جلب إحصائيات الإشعارات
  @Get('statistics')
  getStatistics(@CurrentUser() user: any) {
    return this.notificationsService.getStatistics(user.id);
  }

  // جلب إشعار واحد
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notificationsService.findOne(id, user.id);
  }

  // تحديد إشعار كمقروء
  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @CurrentUser() user: any) {
    const result = await this.notificationsService.markAsRead(id, user.id);

    // تحديث العدد عبر WebSocket
    const unreadCount = await this.notificationsService.getUnreadCount(user.id);
    this.notificationsGateway.server
      .to(`user:${user.id}`)
      .emit('unreadCount', unreadCount);

    return result;
  }

  // تحديد جميع الإشعارات كمقروءة
  @Patch('read-all')
  async markAllAsRead(
    @CurrentUser() user: any,
    @Body() markAllAsReadDto?: MarkAllAsReadDto,
  ) {
    const result = await this.notificationsService.markAllAsRead(
      user.id,
      markAllAsReadDto?.type,
    );

    // تحديث العدد عبر WebSocket
    const unreadCount = await this.notificationsService.getUnreadCount(user.id);
    this.notificationsGateway.server
      .to(`user:${user.id}`)
      .emit('unreadCount', unreadCount);

    return result;
  }

  // حذف إشعار
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notificationsService.remove(id, user.id);
  }

  // حذف جميع الإشعارات المقروءة
  @Delete('read/all')
  removeAllRead(@CurrentUser() user: any) {
    return this.notificationsService.removeAllRead(user.id);
  }

  // تنظيف الإشعارات القديمة (للمشرف فقط)
  @Delete('cleanup/old')
  @Roles(UserRole.ADMIN)
  cleanupOldNotifications() {
    return this.notificationsService.cleanupOldNotifications();
  }

  // جلب إحصائيات الاتصالات (للمشرف فقط)
  @Get('admin/connections')
  @Roles(UserRole.ADMIN)
  getConnectionsStats() {
    return {
      connectedUsers: this.notificationsGateway.getConnectedUsersCount(),
      totalConnections: this.notificationsGateway.getTotalConnectionsCount(),
    };
  }
}
