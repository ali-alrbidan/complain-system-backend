import { IsOptional, IsString } from 'class-validator';

// src/notifications/dto/mark-all-as-read.dto.ts
export class MarkAllAsReadDto {
  @IsOptional()
  @IsString()
  type?: string; // يمكن تحديد نوع معين أو الكل
}
