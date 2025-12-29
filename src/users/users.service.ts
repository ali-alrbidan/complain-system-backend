// src/users/users.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from 'generated/prisma/enums';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ChangePasswordDto } from './dto/chang-password.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // إنشاء مستخدم جديد (للمشرف العام)
  async create(createUserDto: CreateUserDto, adminId: string) {
    console.log('user will be created');
    const { email, phone, password, name, role, departmentId } = createUserDto;

    // التحقق من وجود البريد أو الهاتف
    if (!email && !phone) {
      throw new BadRequestException(
        'يجب إدخال البريد الإلكتروني أو رقم الهاتف',
      );
    }

    // التحقق من عدم وجود المستخدم مسبقاً
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [email ? { email } : {}, phone ? { phone } : {}],
      },
    });

    if (existingUser) {
      throw new ConflictException('المستخدم موجود مسبقاً');
    }

    // التحقق من الجهة إذا كان موظف
    if (departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: departmentId },
      });

      if (!department) {
        throw new NotFoundException('الجهة الحكومية غير موجودة');
      }

      if (!department.isActive) {
        throw new BadRequestException('الجهة الحكومية غير نشطة');
      }
    }

    // تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 10);

    // إنشاء المستخدم
    const user = await this.prisma.user.create({
      data: {
        email,
        phone,
        password: hashedPassword,
        name,
        role,
        departmentId,
        isVerified: true, // المستخدمين الذين ينشئهم المشرف مفعلين تلقائياً
      },
      include: {
        department: true,
      },
    });

    // سجل تدقيق
    await this.prisma.auditLog.create({
      data: {
        action: 'CREATE_USER',
        entity: 'User',
        entityId: user.id,
        userId: adminId,
        details: JSON.stringify({ name, role, email, phone }),
      },
    });

    // إشعار المستخدم الجديد
    await this.prisma.notification.create({
      data: {
        title: 'حساب جديد',
        message: `تم إنشاء حساب لك في نظام الشكاوى الحكومية`,
        type: 'ACCOUNT_CREATED',
        userId: user.id,
      },
    });

    // حذف كلمة المرور من النتيجة
    const { password: _, ...userWithoutPassword } = user;

    return {
      message: 'تم إنشاء المستخدم بنجاح',
      user: userWithoutPassword,
    };
  }

  // جلب جميع المستخدمين مع الفلترة
  async findAll(query: QueryUserDto) {
    const { role, departmentId, isActive, search, page, limit } = query;

    const skip = (page! - 1) * limit!;

    const where: any = {};

    if (role) where.role = role;
    if (departmentId) where.departmentId = departmentId;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          isVerified: true,
          createdAt: true,
          department: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              complaints: true,
              assignedComplaints: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit!),
      },
    };
  }

  // جلب مستخدم واحد
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
        department: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        _count: {
          select: {
            complaints: true,
            assignedComplaints: true,
            comments: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    return user;
  }

  // تحديث مستخدم
  async update(id: string, updateUserDto: UpdateUserDto, adminId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    // التحقق من عدم تكرار البريد أو الهاتف
    if (updateUserDto.email || updateUserDto.phone) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          AND: [
            { NOT: { id } },
            {
              OR: [
                updateUserDto.email ? { email: updateUserDto.email } : {},
                updateUserDto.phone ? { phone: updateUserDto.phone } : {},
              ],
            },
          ],
        },
      });

      if (existingUser) {
        throw new ConflictException(
          'البريد الإلكتروني أو رقم الهاتف مستخدم مسبقاً',
        );
      }
    }

    // التحقق من الجهة
    if (updateUserDto.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: updateUserDto.departmentId },
      });

      if (!department || !department.isActive) {
        throw new BadRequestException('الجهة الحكومية غير موجودة أو غير نشطة');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        isVerified: true,
        department: true,
      },
    });

    // سجل تدقيق
    await this.prisma.auditLog.create({
      data: {
        action: 'UPDATE_USER',
        entity: 'User',
        entityId: id,
        userId: adminId,
        details: JSON.stringify(updateUserDto),
      },
    });

    return {
      message: 'تم تحديث المستخدم بنجاح',
      user: updatedUser,
    };
  }

  // حذف (تعطيل) مستخدم
  async remove(id: string, adminId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    if (user.role === UserRole.ADMIN && id === adminId) {
      throw new BadRequestException('لا يمكن حذف حسابك الخاص');
    }

    // تعطيل المستخدم بدلاً من الحذف
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    // سجل تدقيق
    await this.prisma.auditLog.create({
      data: {
        action: 'DEACTIVATE_USER',
        entity: 'User',
        entityId: id,
        userId: adminId,
      },
    });

    return {
      message: 'تم تعطيل المستخدم بنجاح',
    };
  }

  // تغيير كلمة المرور
  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const { oldPassword, newPassword } = changePasswordDto;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    // التحقق من كلمة المرور القديمة
    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);

    if (!isPasswordValid) {
      throw new BadRequestException('كلمة المرور القديمة غير صحيحة');
    }

    // تشفير كلمة المرور الجديدة
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // سجل تدقيق
    await this.prisma.auditLog.create({
      data: {
        action: 'CHANGE_PASSWORD',
        entity: 'User',
        entityId: userId,
        userId,
      },
    });

    return {
      message: 'تم تغيير كلمة المرور بنجاح',
    };
  }

  // جلب ملف المستخدم الشخصي
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        department: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    return user;
  }

  // تحديث الملف الشخصي
  async updateProfile(
    userId: string,
    updateData: { name?: string; phone?: string; email?: string },
  ) {
    console.log('will be updated');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    // استخراج القيم بشكل آمن
    const { name, phone, email } = updateData || {};

    if (!name && !phone && !email) {
      return {
        message: 'لم يتم تعديل اي شيْ',
        data: user,
      };
    }
    // التحقق من عدم تكرار البريد أو الهاتف
    if (updateData.email || updateData.phone) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          AND: [
            { NOT: { id: userId } },
            {
              OR: [
                updateData.email ? { email: updateData.email } : {},
                updateData.phone ? { phone: updateData.phone } : {},
              ],
            },
          ],
        },
      });

      if (existingUser) {
        throw new ConflictException(
          'البريد الإلكتروني أو رقم الهاتف مستخدم مسبقاً',
        );
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
      },
    });

    return {
      message: 'تم تحديث الملف الشخصي بنجاح',
      user: updatedUser,
    };
  }

  // إحصائيات المستخدمين (للمشرف العام)
  async getUsersStatistics() {
    const [total, citizens, employees, admins, active, inactive, verified] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { role: UserRole.CITIZEN } }),
        this.prisma.user.count({ where: { role: UserRole.EMPLOYEE } }),
        this.prisma.user.count({ where: { role: UserRole.ADMIN } }),
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.user.count({ where: { isActive: false } }),
        this.prisma.user.count({ where: { isVerified: true } }),
      ]);

    return {
      total,
      byRole: {
        citizens,
        employees,
        admins,
      },
      byStatus: {
        active,
        inactive,
        verified,
        unverified: total - verified,
      },
    };
  }
}
