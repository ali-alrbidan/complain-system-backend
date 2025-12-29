// src/users/users.controller.ts
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

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from 'generated/prisma/enums';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import { QueryUserDto } from './dto/query-user.dto';
import { ChangePasswordDto } from './dto/chang-password.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // إنشاء مستخدم جديد (للمشرف العام فقط)
  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() createUserDto: CreateUserDto, @CurrentUser() user: any) {
    return this.usersService.create(createUserDto, user.id);
  }

  // جلب جميع المستخدمين (للمشرف العام فقط)
  @Get()
  @Roles(UserRole.ADMIN)
  findAll(@Query() query: QueryUserDto) {
    return this.usersService.findAll(query);
  }

  // جلب إحصائيات المستخدمين (للمشرف العام)
  @Get('statistics')
  @Roles(UserRole.ADMIN)
  getUsersStatistics() {
    return this.usersService.getUsersStatistics();
  }

  // جلب الملف الشخصي للمستخدم الحالي
  @Get('profile')
  getProfile(@CurrentUser() user: any) {
    return this.usersService.getProfile(user.id);
  }

  // تحديث الملف الشخصي
  @Patch('profile')
  updateProfile(
    @CurrentUser() user: any,
    @Body() updateData: { name?: string; phone?: string; email?: string },
  ) {
    return this.usersService.updateProfile(user.id, updateData);
  }

  // تغيير كلمة المرور
  @Patch('change-password')
  changePassword(
    @CurrentUser() user: any,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(user.id, changePasswordDto);
  }

  // جلب مستخدم واحد (للمشرف العام)
  @Get(':id')
  @Roles(UserRole.ADMIN)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  // تحديث مستخدم (للمشرف العام)
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: any,
  ) {
    return this.usersService.update(id, updateUserDto, user.id);
  }

  // حذف (تعطيل) مستخدم (للمشرف العام)
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.usersService.remove(id, user.id);
  }
}
