// src/complaints/dto/query-complaint.dto.ts
import { IsOptional, IsEnum, IsString, IsInt, Min } from 'class-validator';

import { Type } from 'class-transformer';
import { ComplaintStatus } from 'generated/prisma/enums';

export class QueryComplaintDto {
  @IsOptional()
  @IsEnum(ComplaintStatus)
  status?: ComplaintStatus;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  citizenId?: string;

  @IsOptional()
  @IsString()
  search?: string; // البحث في الوصف أو الرقم المرجعي

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;
}
