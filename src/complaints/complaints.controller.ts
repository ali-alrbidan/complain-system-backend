// src/complaints/complaints.controller.ts
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
import { ComplaintsService } from './complaints.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { ComplaintStatus, UserRole } from 'generated/prisma/enums';
import { QueryComplaintDto } from './dto/query-complaint.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';

@Controller('complaints')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  // إنشاء شكوى جديدة (للمواطنين)
  @Post()
  @Roles(UserRole.CITIZEN)
  create(
    @Body() createComplaintDto: CreateComplaintDto,
    @CurrentUser() user: any,
  ) {
    return this.complaintsService.create(createComplaintDto, user.id);
  }

  // جلب جميع الشكاوى (حسب الصلاحيات)
  @Get()
  findAll(@Query() query: QueryComplaintDto, @CurrentUser() user: any) {
    return this.complaintsService.findAll(query, user.id, user.role);
  }

  // جلب إحصائيات الشكاوى
  @Get('statistics')
  @Roles(UserRole.EMPLOYEE, UserRole.ADMIN)
  getStatistics(@CurrentUser() user: any) {
    return this.complaintsService.getStatistics(user.id, user.role);
  }

  // جلب شكوى واحدة بالتفاصيل
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.complaintsService.findOne(id, user.id, user.role);
  }

  // تحديث حالة الشكوى (للموظفين والمشرفين)
  @Patch(':id')
  @Roles(UserRole.EMPLOYEE, UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateComplaintDto: UpdateComplaintDto,
    @CurrentUser() user: any,
  ) {
    return this.complaintsService.update(
      id,
      updateComplaintDto,
      user.id,
      user.role,
    );
  }

  // قفل الشكوى للمعالجة
  @Patch(':id/lock')
  @Roles(UserRole.EMPLOYEE, UserRole.ADMIN)
  lockComplaint(@Param('id') id: string, @CurrentUser() user: any) {
    return this.complaintsService.lockComplaint(id, user.id, user.role);
  }

  // إلغاء قفل الشكوى
  @Patch(':id/unlock')
  @Roles(UserRole.EMPLOYEE, UserRole.ADMIN)
  unlockComplaint(@Param('id') id: string, @CurrentUser() user: any) {
    return this.complaintsService.unlockComplaint(id, user.id, user.role);
  }

  // إضافة تعليق على الشكوى
  @Post(':id/comments')
  addComment(
    @Param('id') complaintId: string,
    @Body() addCommentDto: AddCommentDto,
    @CurrentUser() user: any,
  ) {
    return this.complaintsService.addComment(
      complaintId,
      addCommentDto,
      user.id,
      user.role,
    );
  }

  // حذف شكوى (للمشرف العام فقط)
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.complaintsService.remove(id, user.role);
  }
}
