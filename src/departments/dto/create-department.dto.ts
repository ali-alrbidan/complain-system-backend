// src/departments/dto/create-department.dto.ts
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  name: string; // اسم الجهة

  @IsOptional()
  @IsString()
  description?: string; // وصف الجهة

  @IsOptional()
  @IsBoolean()
  isActive?: boolean; // حالة الجهة (نشطة/غير نشطة)
}
