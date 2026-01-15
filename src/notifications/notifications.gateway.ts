// src/notifications/notifications.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

// Guard للتحقق من JWT في WebSocket
export class WsJwtGuard {
  constructor(private jwtService: JwtService) {}

  async canActivate(socket: Socket): Promise<boolean> {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        return false;
      }

      const payload = this.jwtService.verify(token);
      socket.data.user = payload;
      return true;
    } catch (error) {
      return false;
    }
  }
}

@WebSocketGateway({
  cors: {
    origin: '*', // في الإنتاج، حدد النطاقات المسموحة
  },
  namespace: 'notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private connectedUsers = new Map<string, string[]>(); // userId -> [socketIds]

  constructor(
    private jwtService: JwtService,
    private notificationsService: NotificationsService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // التحقق من JWT
      const token =
        client.handshake.auth.token ||
        client.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn('Connection rejected: No token provided');
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = payload.sub;

      client.data.userId = userId;
      client.data.user = payload;

      // إضافة المستخدم للقائمة
      if (!this.connectedUsers.has(userId)) {
        this.connectedUsers.set(userId, []);
      }
      this.connectedUsers.get(userId)!.push(client.id);

      // الانضمام إلى غرفة المستخدم
      client.join(`user:${userId}`);

      this.logger.log(`Client connected: ${client.id} (User: ${userId})`);

      // إرسال عدد الإشعارات غير المقروءة
      const unreadCount =
        await this.notificationsService.getUnreadCount(userId);
      client.emit('unreadCount', unreadCount);
    } catch (error) {
      this.logger.error('Connection error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;

    if (userId && this.connectedUsers.has(userId)) {
      const sockets = this.connectedUsers.get(userId)!;
      const index = sockets.indexOf(client.id);
      if (index > -1) {
        sockets.splice(index, 1);
      }

      if (sockets.length === 0) {
        this.connectedUsers.delete(userId);
      }
    }

    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // إرسال إشعار لمستخدم معين
  async sendNotificationToUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('newNotification', notification);

    // تحديث عدد الإشعارات غير المقروءة
    const unreadCount = await this.notificationsService.getUnreadCount(userId);
    this.server.to(`user:${userId}`).emit('unreadCount', unreadCount);

    this.logger.log(`Notification sent to user ${userId}`);
  }

  // إرسال إشعارات لمستخدمين متعددين
  async sendNotificationToUsers(userIds: string[], notification: any) {
    for (const userId of userIds) {
      await this.sendNotificationToUser(userId, notification);
    }
  }

  // استقبال طلب قراءة إشعار
  @SubscribeMessage('markAsRead')
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notificationId: string },
  ) {
    try {
      const userId = client.data.userId;
      await this.notificationsService.markAsRead(data.notificationId, userId);

      // تحديث عدد الإشعارات غير المقروءة
      const unreadCount =
        await this.notificationsService.getUnreadCount(userId);
      client.emit('unreadCount', unreadCount);

      return { success: true };
    } catch (error) {
      this.logger.error('Error marking notification as read:', error);
      return { success: false, error: error.message };
    }
  }

  // استقبال طلب قراءة جميع الإشعارات
  @SubscribeMessage('markAllAsRead')
  async handleMarkAllAsRead(@ConnectedSocket() client: Socket) {
    try {
      const userId = client.data.userId;
      await this.notificationsService.markAllAsRead(userId);

      // تحديث عدد الإشعارات غير المقروءة
      const unreadCount =
        await this.notificationsService.getUnreadCount(userId);
      client.emit('unreadCount', unreadCount);

      return { success: true };
    } catch (error) {
      this.logger.error('Error marking all notifications as read:', error);
      return { success: false, error: error.message };
    }
  }

  // جلب عدد الإشعارات غير المقروءة
  @SubscribeMessage('getUnreadCount')
  async handleGetUnreadCount(@ConnectedSocket() client: Socket) {
    try {
      const userId = client.data.userId;
      const unreadCount =
        await this.notificationsService.getUnreadCount(userId);
      client.emit('unreadCount', unreadCount);
      return unreadCount;
    } catch (error) {
      this.logger.error('Error getting unread count:', error);
      return { success: false, error: error.message };
    }
  }

  // التحقق من اتصال المستخدم
  isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  // جلب عدد الاتصالات النشطة
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  // جلب عدد الاتصالات الكلية
  getTotalConnectionsCount(): number {
    let total = 0;
    this.connectedUsers.forEach((sockets) => {
      total += sockets.length;
    });
    return total;
  }
}
