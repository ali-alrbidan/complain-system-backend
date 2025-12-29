import { IsString } from 'class-validator';

// src/departments/dto/assign-employee.dto.ts
export class AssignEmployeeDto {
  @IsString()
  userId: string; // معرف الموظف

  @IsString()
  departmentId: string; // معرف الجهة
}
