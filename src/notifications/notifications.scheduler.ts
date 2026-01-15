// src/notifications/notifications.scheduler.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(
    private notificationsService: NotificationsService,
    private notificationsGateway: NotificationsGateway,
    private prisma: PrismaService,
  ) {}

  // تنظيف الإشعارات القديمة (كل يوم في منتصف الليل)
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCleanupOldNotifications() {
    this.logger.log('Running cleanup of old notifications...');
    try {
      const result = await this.notificationsService.cleanupOldNotifications();
      this.logger.log(`Cleaned up ${result.count} old notifications`);
    } catch (error) {
      this.logger.error('Error cleaning up notifications:', error);
    }
  }

  // إشعار بالشكاوى المتأخرة (كل يوم في الساعة 9 صباحاً)
  @Cron('0 9 * * *')
  async handlePendingComplaintsReminder() {
    this.logger.log('Checking for pending complaints...');
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      // جلب الشكاوى المعلقة لأكثر من 3 أيام
      const pendingComplaints = await this.prisma.complaint.findMany({
        where: {
          status: 'NEW',
          createdAt: {
            lte: threeDaysAgo,
          },
        },
        include: {
          department: {
            include: {
              employees: {
                where: { isActive: true },
              },
            },
          },
        },
      });

      for (const complaint of pendingComplaints) {
        if (!complaint.department) continue;

        // إشعار لموظفي الجهة
        for (const employee of complaint.department.employees) {
          const notification = await this.prisma.notification.create({
            data: {
              title: 'تذكير: شكوى معلقة',
              message: `الشكوى رقم ${complaint.referenceNumber} معلقة منذ ${Math.floor((Date.now() - complaint.createdAt.getTime()) / (1000 * 60 * 60 * 24))} يوم`,
              type: 'PENDING_REMINDER',
              userId: employee.id,
              complaintId: complaint.id,
            },
          });

          // إرسال عبر WebSocket
          await this.notificationsGateway.sendNotificationToUser(
            employee.id,
            notification,
          );
        }
      }

      this.logger.log(
        `Sent reminders for ${pendingComplaints.length} pending complaints`,
      );
    } catch (error) {
      this.logger.error('Error sending pending complaints reminders:', error);
    }
  }

  // إشعار بالشكاوى التي تقترب من الموعد النهائي (كل ساعة)
  @Cron(CronExpression.EVERY_HOUR)
  async handleDeadlineReminders() {
    this.logger.log('Checking for complaints approaching deadline...');
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      // جلب الشكاوى قيد المعالجة
      const complaints = await this.prisma.complaint.findMany({
        where: {
          status: 'IN_PROGRESS',
          lockedAt: {
            not: null,
          },
        },
        include: {
          assignedEmployee: true,
        },
      });

      for (const complaint of complaints) {
        if (!complaint.assignedEmployee || !complaint.lockedAt) continue;

        const daysSinceLocked = Math.floor(
          (Date.now() - complaint.lockedAt.getTime()) / (1000 * 60 * 60 * 24),
        );

        // إذا مر أكثر من 7 أيام على قفل الشكوى
        if (daysSinceLocked >= 7) {
          const notification = await this.prisma.notification.create({
            data: {
              title: 'تحذير: شكوى متأخرة',
              message: `الشكوى رقم ${complaint.referenceNumber} قيد المعالجة منذ ${daysSinceLocked} يوم`,
              type: 'DEADLINE_WARNING',
              userId: complaint.assignedEmployee.id,
              complaintId: complaint.id,
            },
          });

          await this.notificationsGateway.sendNotificationToUser(
            complaint.assignedEmployee.id,
            notification,
          );
        }
      }

      this.logger.log('Deadline reminders check completed');
    } catch (error) {
      this.logger.error('Error sending deadline reminders:', error);
    }
  }

  // تقرير يومي للمشرفين (كل يوم في الساعة 8 صباحاً)
  @Cron('0 8 * * *')
  async handleDailyReportForAdmins() {
    this.logger.log('Sending daily reports to admins...');
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // إحصائيات اليوم السابق
      const [newComplaints, completedComplaints, totalComplaints] =
        await Promise.all([
          this.prisma.complaint.count({
            where: {
              createdAt: {
                gte: yesterday,
                lt: today,
              },
            },
          }),
          this.prisma.complaint.count({
            where: {
              status: 'COMPLETED',
              resolvedAt: {
                gte: yesterday,
                lt: today,
              },
            },
          }),
          this.prisma.complaint.count(),
        ]);

      // جلب جميع المشرفين
      const admins = await this.prisma.user.findMany({
        where: {
          role: 'ADMIN',
          isActive: true,
        },
      });

      // إرسال التقرير لكل مشرف
      for (const admin of admins) {
        const notification = await this.prisma.notification.create({
          data: {
            title: 'التقرير اليومي',
            message: `شكاوى جديدة: ${newComplaints} | شكاوى منجزة: ${completedComplaints} | إجمالي الشكاوى: ${totalComplaints}`,
            type: 'DAILY_REPORT',
            userId: admin.id,
          },
        });

        await this.notificationsGateway.sendNotificationToUser(
          admin.id,
          notification,
        );
      }

      this.logger.log(`Daily reports sent to ${admins.length} admins`);
    } catch (error) {
      this.logger.error('Error sending daily reports:', error);
    }
  }
}
