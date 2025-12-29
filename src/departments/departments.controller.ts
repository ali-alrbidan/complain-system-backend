// src/departments/departments.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DepartmentsService } from './departments.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from 'generated/prisma/enums';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { QueryDepartmentDto } from './dto/query-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { AssignEmployeeDto } from './dto/assign-employee.dto';

@Controller('departments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  // إنشاء جهة حكومية جديدة (للمشرف العام فقط)
  @Post()
  @Roles(UserRole.ADMIN)
  create(
    @Body() createDepartmentDto: CreateDepartmentDto,
    @CurrentUser() user: any,
  ) {
    return this.departmentsService.create(createDepartmentDto, user.id);
  }

  // جلب جميع الجهات الحكومية
  @Get()
  findAll(@Query() query: QueryDepartmentDto) {
    return this.departmentsService.findAll(query);
  }

  // جلب الجهات النشطة فقط (متاح للجميع)
  @Get('active')
  getActiveDepartments() {
    return this.departmentsService.getActiveDepartments();
  }

  // جلب جهة واحدة بالتفاصيل
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.departmentsService.findOne(id);
  }

  // تحديث جهة حكومية (للمشرف العام فقط)
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateDepartmentDto: UpdateDepartmentDto,
    @CurrentUser() user: any,
  ) {
    return this.departmentsService.update(id, updateDepartmentDto, user.id);
  }

  // حذف (تعطيل) جهة حكومية (للمشرف العام فقط)
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.departmentsService.remove(id, user.id);
  }

  // تعيين موظف لجهة (للمشرف العام فقط)
  @Post('assign-employee')
  @Roles(UserRole.ADMIN)
  assignEmployee(
    @Body() assignEmployeeDto: AssignEmployeeDto,
    @CurrentUser() user: any,
  ) {
    return this.departmentsService.assignEmployee(assignEmployeeDto, user.id);
  }

  // إزالة موظف من جهة (للمشرف العام فقط)
  @Delete('remove-employee/:userId')
  @Roles(UserRole.ADMIN)
  removeEmployee(@Param('userId') userId: string, @CurrentUser() user: any) {
    return this.departmentsService.removeEmployee(userId, user.id);
  }

  // جلب موظفي جهة معينة
  @Get(':id/employees')
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE)
  getDepartmentEmployees(@Param('id') id: string) {
    return this.departmentsService.getDepartmentEmployees(id);
  }

  // جلب شكاوى جهة معينة
  @Get(':id/complaints')
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE)
  getDepartmentComplaints(
    @Param('id') id: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.departmentsService.getDepartmentComplaints(
      id,
      Number(page),
      Number(limit),
    );
  }

  // جلب إحصائيات جهة معينة
  @Get(':id/statistics')
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE)
  getComplaintsStatistics(@Param('id') id: string) {
    return this.departmentsService.getComplaintsStatistics(id);
  }

  // جلب تقرير شامل عن الجهة
  @Get(':id/report')
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE)
  getDepartmentReport(@Param('id') id: string) {
    return this.departmentsService.getDepartmentReport(id);
  }
}
