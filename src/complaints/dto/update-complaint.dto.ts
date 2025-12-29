// src/complaints/dto/update-complaint.dto.ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ComplaintStatus } from 'generated/prisma/enums';

export class UpdateComplaintDto {
  @IsOptional()
  @IsEnum(ComplaintStatus)
  status?: ComplaintStatus;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  assignedEmployeeId?: string;
}
