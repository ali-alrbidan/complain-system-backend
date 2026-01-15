import { IsString } from 'class-validator';

// src/notifications/dto/mark-as-read.dto.ts
export class MarkAsReadDto {
  @IsString()
  notificationId: string;
}
