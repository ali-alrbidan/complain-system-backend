// src/departments/departments.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

import { UserRole } from 'generated/prisma/enums';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { AssignEmployeeDto } from './dto/assign-employee.dto';
import { QueryDepartmentDto } from './dto/query-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  // إنشاء جهة حكومية جديدة (للمشرف العام فقط)
  async create(createDepartmentDto: CreateDepartmentDto, userId: string) {
    // التحقق من عدم وجود جهة بنفس الاسم
    const existingDepartment = await this.prisma.department.findFirst({
      where: { name: createDepartmentDto.name },
    });

    if (existingDepartment) {
      throw new ConflictException('جهة بهذا الاسم موجودة مسبقاً');
    }

    const department = await this.prisma.department.create({
      data: {
        ...createDepartmentDto,
        isActive: createDepartmentDto.isActive ?? true,
      },
    });

    // إنشاء سجل تدقيق
    await this.prisma.auditLog.create({
      data: {
        action: 'CREATE_DEPARTMENT',
        entity: 'Department',
        entityId: department.id,
        userId,
        details: JSON.stringify(createDepartmentDto),
      },
    });

    return {
      message: 'تم إنشاء الجهة الحكومية بنجاح',
      department,
    };
  }

  // جلب جميع الجهات مع الفلترة
  async findAll(query: QueryDepartmentDto) {
    const { search, isActive, page, limit } = query;

    const skip = (page! - 1) * limit!;

    // بناء شروط البحث
    const where: any = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [departments, total] = await Promise.all([
      this.prisma.department.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              employees: true,
              complaints: true,
            },
          },
        },
      }),
      this.prisma.department.count({ where }),
    ]);

    return {
      data: departments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit!),
      },
    };
  }

  // جلب جهة واحدة بالتفاصيل
  async findOne(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        employees: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            complaints: true,
          },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('الجهة الحكومية غير موجودة');
    }

    // جلب إحصائيات الشكاوى
    const complaintsStats = await this.getComplaintsStatistics(id);

    return {
      ...department,
      complaintsStats,
    };
  }

  // تحديث جهة حكومية
  async update(
    id: string,
    updateDepartmentDto: UpdateDepartmentDto,
    userId: string,
  ) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    });

    if (!department) {
      throw new NotFoundException('الجهة الحكومية غير موجودة');
    }

    // التحقق من عدم تكرار الاسم
    if (updateDepartmentDto.name) {
      const existingDepartment = await this.prisma.department.findFirst({
        where: {
          name: updateDepartmentDto.name,
          NOT: { id },
        },
      });

      if (existingDepartment) {
        throw new ConflictException('جهة بهذا الاسم موجودة مسبقاً');
      }
    }

    const updatedDepartment = await this.prisma.department.update({
      where: { id },
      data: updateDepartmentDto,
    });

    // إنشاء سجل تدقيق
    await this.prisma.auditLog.create({
      data: {
        action: 'UPDATE_DEPARTMENT',
        entity: 'Department',
        entityId: id,
        userId,
        details: JSON.stringify(updateDepartmentDto),
      },
    });

    return {
      message: 'تم تحديث الجهة الحكومية بنجاح',
      department: updatedDepartment,
    };
  }

  // حذف جهة حكومية (soft delete - تعطيل فقط)
  async remove(id: string, userId: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            employees: true,
            complaints: true,
          },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('الجهة الحكومية غير موجودة');
    }

    // التحقق من وجود شكاوى نشطة
    const activeComplaints = await this.prisma.complaint.count({
      where: {
        departmentId: id,
        status: { in: ['NEW', 'IN_PROGRESS'] },
      },
    });

    if (activeComplaints > 0) {
      throw new BadRequestException(
        `لا يمكن حذف الجهة لوجود ${activeComplaints} شكوى نشطة`,
      );
    }

    // تعطيل الجهة بدلاً من الحذف
    const updatedDepartment = await this.prisma.department.update({
      where: { id },
      data: { isActive: false },
    });

    // إنشاء سجل تدقيق
    await this.prisma.auditLog.create({
      data: {
        action: 'DEACTIVATE_DEPARTMENT',
        entity: 'Department',
        entityId: id,
        userId,
      },
    });

    return {
      message: 'تم تعطيل الجهة الحكومية بنجاح',
      department: updatedDepartment,
    };
  }

  // تعيين موظف لجهة
  async assignEmployee(assignEmployeeDto: AssignEmployeeDto, adminId: string) {
    const { userId, departmentId } = assignEmployeeDto;

    // التحقق من وجود المستخدم
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    // التحقق من أن المستخدم موظف
    if (user.role === UserRole.CITIZEN) {
      throw new BadRequestException('لا يمكن تعيين مواطن كموظف في جهة حكومية');
    }

    // التحقق من وجود الجهة
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department) {
      throw new NotFoundException('الجهة الحكومية غير موجودة');
    }

    if (!department.isActive) {
      throw new BadRequestException('الجهة الحكومية غير نشطة');
    }

    // تعيين الموظف للجهة
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { departmentId },
      include: {
        department: true,
      },
    });

    // إنشاء سجل تدقيق
    await this.prisma.auditLog.create({
      data: {
        action: 'ASSIGN_EMPLOYEE',
        entity: 'User',
        entityId: userId,
        userId: adminId,
        details: JSON.stringify({
          departmentId,
          departmentName: department.name,
        }),
      },
    });

    // إشعار الموظف
    await this.prisma.notification.create({
      data: {
        title: 'تعيين في جهة حكومية',
        message: `تم تعيينك في جهة: ${department.name}`,
        type: 'ASSIGNMENT',
        userId,
      },
    });

    return {
      message: 'تم تعيين الموظف في الجهة بنجاح',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        department: updatedUser.department,
      },
    };
  }

  // إزالة موظف من جهة
  async removeEmployee(userId: string, adminId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { department: true },
    });

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    if (!user.departmentId) {
      throw new BadRequestException('المستخدم غير معين في أي جهة');
    }

    const departmentName = user.department?.name;

    // إزالة الموظف من الجهة
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { departmentId: null },
    });

    // إنشاء سجل تدقيق
    await this.prisma.auditLog.create({
      data: {
        action: 'REMOVE_EMPLOYEE',
        entity: 'User',
        entityId: userId,
        userId: adminId,
        details: JSON.stringify({ departmentName }),
      },
    });

    // إشعار الموظف
    await this.prisma.notification.create({
      data: {
        title: 'إزالة من جهة حكومية',
        message: `تم إزالتك من جهة: ${departmentName}`,
        type: 'REMOVAL',
        userId,
      },
    });

    return {
      message: 'تم إزالة الموظف من الجهة بنجاح',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
      },
    };
  }

  // جلب موظفي جهة معينة
  async getDepartmentEmployees(departmentId: string) {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department) {
      throw new NotFoundException('الجهة الحكومية غير موجودة');
    }

    const employees = await this.prisma.user.findMany({
      where: { departmentId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      department: {
        id: department.id,
        name: department.name,
      },
      employees,
      total: employees.length,
    };
  }

  // جلب شكاوى جهة معينة
  async getDepartmentComplaints(
    departmentId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department) {
      throw new NotFoundException('الجهة الحكومية غير موجودة');
    }

    const skip = (page - 1) * limit;

    const [complaints, total] = await Promise.all([
      this.prisma.complaint.findMany({
        where: { departmentId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          citizen: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          assignedEmployee: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              comments: true,
              attachments: true,
            },
          },
        },
      }),
      this.prisma.complaint.count({ where: { departmentId } }),
    ]);

    return {
      department: {
        id: department.id,
        name: department.name,
      },
      complaints,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // إحصائيات شكاوى الجهة
  async getComplaintsStatistics(departmentId: string) {
    const [total, newCount, inProgressCount, completedCount, rejectedCount] =
      await Promise.all([
        this.prisma.complaint.count({
          where: { departmentId },
        }),
        this.prisma.complaint.count({
          where: { departmentId, status: 'NEW' },
        }),
        this.prisma.complaint.count({
          where: { departmentId, status: 'IN_PROGRESS' },
        }),
        this.prisma.complaint.count({
          where: { departmentId, status: 'COMPLETED' },
        }),
        this.prisma.complaint.count({
          where: { departmentId, status: 'REJECTED' },
        }),
      ]);

    return {
      total,
      byStatus: {
        new: newCount,
        inProgress: inProgressCount,
        completed: completedCount,
        rejected: rejectedCount,
      },
    };
  }

  // جلب الجهات النشطة فقط (للمواطنين عند إنشاء شكوى)
  async getActiveDepartments() {
    const departments = await this.prisma.department.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
      },
      orderBy: { name: 'asc' },
    });

    return departments;
  }

  // تقرير شامل عن الجهة
  async getDepartmentReport(departmentId: string) {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        _count: {
          select: {
            employees: true,
            complaints: true,
          },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('الجهة الحكومية غير موجودة');
    }

    // إحصائيات الشكاوى
    const complaintsStats = await this.getComplaintsStatistics(departmentId);

    // متوسط وقت المعالجة
    const completedComplaints = await this.prisma.complaint.findMany({
      where: {
        departmentId,
        status: 'COMPLETED',
        resolvedAt: { not: null },
      },
      select: {
        createdAt: true,
        resolvedAt: true,
      },
    });

    let averageResolutionTime = 0;
    if (completedComplaints.length > 0) {
      const totalTime = completedComplaints.reduce((sum, complaint) => {
        const diff =
          complaint.resolvedAt!.getTime() - complaint.createdAt.getTime();
        return sum + diff;
      }, 0);
      averageResolutionTime =
        totalTime / completedComplaints.length / (1000 * 60 * 60 * 24); // بالأيام
    }

    // أكثر الموظفين نشاطاً
    const topEmployees = await this.prisma.user.findMany({
      where: { departmentId },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            assignedComplaints: true,
          },
        },
      },
      orderBy: {
        assignedComplaints: {
          _count: 'desc',
        },
      },
      take: 5,
    });

    return {
      department: {
        id: department.id,
        name: department.name,
        description: department.description,
        isActive: department.isActive,
        employeesCount: department._count.employees,
        complaintsCount: department._count.complaints,
      },
      complaintsStats,
      averageResolutionTimeDays: Math.round(averageResolutionTime * 10) / 10,
      topEmployees,
    };
  }
}
