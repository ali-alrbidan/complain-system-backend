// src/notifications/notifications.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { QueryNotificationDto } from './dto/query-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  // إنشاء إشعار جديد
  async create(createNotificationDto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: createNotificationDto,
      include: {
        complaint: {
          select: {
            id: true,
            referenceNumber: true,
            type: true,
            status: true,
          },
        },
      },
    });

    return notification;
  }

  // إنشاء إشعارات متعددة (Bulk Notifications)
  async createBulk(notifications: CreateNotificationDto[]) {
    const createdNotifications = await this.prisma.notification.createMany({
      data: notifications,
    });

    return {
      message: `تم إنشاء ${createdNotifications.count} إشعار`,
      count: createdNotifications.count,
    };
  }

  // جلب إشعارات المستخدم
  async findAllForUser(userId: string, query: QueryNotificationDto) {
    const { isRead, type, page, limit } = query;

    const skip = (page! - 1) * limit!;

    const where: any = { userId };

    if (isRead !== undefined) {
      where.isRead = isRead;
    }

    if (type) {
      where.type = type;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          complaint: {
            select: {
              id: true,
              referenceNumber: true,
              type: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: {
          userId,
          isRead: false,
        },
      }),
    ]);

    return {
      data: notifications,
      meta: {
        total,
        unreadCount,
        page,
        limit,
        totalPages: Math.ceil(total / limit!),
      },
    };
  }

  // جلب إشعار واحد
  async findOne(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      include: {
        complaint: {
          select: {
            id: true,
            referenceNumber: true,
            type: true,
            status: true,
            description: true,
          },
        },
      },
    });

    if (!notification) {
      throw new NotFoundException('الإشعار غير موجود');
    }

    // التحقق من أن الإشعار يخص المستخدم
    if (notification.userId !== userId) {
      throw new NotFoundException('الإشعار غير موجود');
    }

    return notification;
  }

  // تحديد إشعار كمقروء
  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('الإشعار غير موجود');
    }

    if (notification.userId !== userId) {
      throw new NotFoundException('الإشعار غير موجود');
    }

    const updatedNotification = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return {
      message: 'تم تحديد الإشعار كمقروء',
      notification: updatedNotification,
    };
  }

  // تحديد جميع الإشعارات كمقروءة
  async markAllAsRead(userId: string, type?: string) {
    const where: any = {
      userId,
      isRead: false,
    };

    if (type) {
      where.type = type;
    }

    const result = await this.prisma.notification.updateMany({
      where,
      data: { isRead: true },
    });

    return {
      message: `تم تحديد ${result.count} إشعار كمقروء`,
      count: result.count,
    };
  }

  // حذف إشعار
  async remove(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('الإشعار غير موجود');
    }

    if (notification.userId !== userId) {
      throw new NotFoundException('الإشعار غير موجود');
    }

    await this.prisma.notification.delete({
      where: { id },
    });

    return {
      message: 'تم حذف الإشعار بنجاح',
    };
  }

  // حذف جميع الإشعارات المقروءة
  async removeAllRead(userId: string) {
    const result = await this.prisma.notification.deleteMany({
      where: {
        userId,
        isRead: true,
      },
    });

    return {
      message: `تم حذف ${result.count} إشعار`,
      count: result.count,
    };
  }

  // جلب عدد الإشعارات غير المقروءة
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    return { unreadCount: count };
  }

  // جلب إحصائيات الإشعارات
  async getStatistics(userId: string) {
    const [total, unread, byType] = await Promise.all([
      this.prisma.notification.count({
        where: { userId },
      }),
      this.prisma.notification.count({
        where: { userId, isRead: false },
      }),
      this.prisma.notification.groupBy({
        by: ['type'],
        where: { userId },
        _count: true,
      }),
    ]);

    const typeStats = byType.reduce(
      (acc, item) => {
        acc[item.type] = item._count;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      total,
      unread,
      read: total - unread,
      byType: typeStats,
    };
  }

  // إنشاء إشعارات تلقائية للشكوى
  async createComplaintNotifications(
    complaintId: string,
    type: string,
    title: string,
    message: string,
  ) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id: complaintId },
      include: {
        citizen: true,
        department: {
          include: {
            employees: {
              where: { isActive: true },
            },
          },
        },
      },
    });

    if (!complaint) {
      return;
    }

    const notifications: CreateNotificationDto[] = [];

    // إشعار للمواطن
    if (type !== 'COMPLAINT_CREATED') {
      notifications.push({
        title,
        message,
        type,
        userId: complaint.citizenId,
        complaintId,
      });
    }

    // إشعار لموظفي الجهة
    if (complaint.department && type === 'NEW_COMPLAINT') {
      for (const employee of complaint.department.employees) {
        notifications.push({
          title,
          message,
          type,
          userId: employee.id,
          complaintId,
        });
      }
    }

    if (notifications.length > 0) {
      await this.createBulk(notifications);
    }

    return notifications;
  }

  // حذف الإشعارات القديمة (أكثر من 30 يوم)
  async cleanupOldNotifications() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.prisma.notification.deleteMany({
      where: {
        isRead: true,
        createdAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    return {
      message: `تم حذف ${result.count} إشعار قديم`,
      count: result.count,
    };
  }
}
