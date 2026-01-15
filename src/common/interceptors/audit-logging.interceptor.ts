// src/common/interceptors/audit-logging.interceptor.ts
// البرمجة الموجهة للجوانب (AOP) للتسجيل والمراقبة

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditLoggingInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, user, ip, headers } = request;

    // تسجيل العمليات المهمة فقط (POST, PATCH, PUT, DELETE)
    const shouldLog = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

    if (!shouldLog || !user) {
      return next.handle();
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: async (response) => {
          const executionTime = Date.now() - startTime;

          try {
            // استخراج نوع العملية من URL
            const action = this.extractAction(method, url);
            const entity = this.extractEntity(url);
            const entityId = this.extractEntityId(url, body, response);

            await this.prisma.auditLog.create({
              data: {
                action,
                entity,
                entityId,
                userId: user.id,
                ipAddress: ip || request.connection.remoteAddress,
                userAgent: headers['user-agent'],
                details: JSON.stringify({
                  method,
                  url,
                  body: this.sanitizeBody(body),
                  executionTime: `${executionTime}ms`,
                }),
              },
            });
          } catch (error) {
            console.error('Audit logging failed:', error);
          }
        },
        error: async (error) => {
          // تسجيل العمليات الفاشلة أيضاً
          try {
            await this.prisma.auditLog.create({
              data: {
                action: 'FAILED_OPERATION',
                entity: this.extractEntity(url),
                entityId: this.extractEntityId(url, body, null),
                userId: user?.id,
                ipAddress: ip,
                details: JSON.stringify({
                  method,
                  url,
                  error: error.message,
                }),
              },
            });
          } catch (logError) {
            console.error('Error audit logging failed:', logError);
          }
        },
      }),
    );
  }

  private extractAction(method: string, url: string): string {
    if (method === 'POST') return 'CREATE';
    if (method === 'PATCH' || method === 'PUT') return 'UPDATE';
    if (method === 'DELETE') return 'DELETE';
    return 'UNKNOWN';
  }

  private extractEntity(url: string): string {
    // استخراج اسم الكيان من URL
    // مثال: /api/users/123 -> User
    // مثال: /api/complaints -> Complaint
    const match = url.match(/\/api\/(\w+)/);
    if (match) {
      const entity = match[1];
      return entity.charAt(0).toUpperCase() + entity.slice(1, -1); // users -> User
    }
    return 'Unknown';
  }

  private extractEntityId(url: string, body: any, response: any): string {
    // استخراج ID من URL
    const match = url.match(/\/([a-f0-9-]{36})/i);
    if (match) return match[1];

    // أو من الـ response
    if (response?.data?.id) return response.data.id;
    if (response?.user?.id) return response.user.id;
    if (response?.complaint?.id) return response.complaint.id;

    return 'N/A';
  }

  private sanitizeBody(body: any): any {
    if (!body) return {};

    const sanitized = { ...body };
    // إزالة كلمات المرور من السجلات
    if (sanitized.password) sanitized.password = '***';
    if (sanitized.oldPassword) sanitized.oldPassword = '***';
    if (sanitized.newPassword) sanitized.newPassword = '***';

    return sanitized;
  }
}
