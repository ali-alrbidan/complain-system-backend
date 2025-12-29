// src/complaints/dto/create-complaint.dto.ts
import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';

export class CreateComplaintDto {
  @IsString()
  type: string; // نوع الشكوى

  @IsString()
  location: string; // الموقع

  @IsString()
  description: string; // وصف المشكلة

  @IsOptional()
  @IsString()
  departmentId?: string; // الجهة الحكومية

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number; // الأولوية (1-5)
}
