import { IsBoolean, IsOptional, IsString } from 'class-validator';

// src/departments/dto/update-department.dto.ts
export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
