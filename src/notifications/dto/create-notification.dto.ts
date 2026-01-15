// src/notifications/dto/create-notification.dto.ts
import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  title: string; // عنوان الإشعار

  @IsString()
  message: string; // نص الإشعار

  @IsString()
  type: string; // نوع الإشعار

  @IsString()
  userId: string; // المستخدم المستقبل

  @IsOptional()
  @IsString()
  complaintId?: string; // معرف الشكوى (إن وجد)
}
