// src/notifications/dto/query-notification.dto.ts
import { IsOptional, IsBoolean, IsString, IsInt, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class QueryNotificationDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isRead?: boolean;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
