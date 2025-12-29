// src/complaints/complaints.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { ComplaintStatus, UserRole } from 'generated/prisma/enums';
import { QueryComplaintDto } from './dto/query-complaint.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';

@Injectable()
export class ComplaintsService {
  constructor(private prisma: PrismaService) {}

  // توليد رقم مرجعي فريد
  private async generateReferenceNumber(): Promise<string> {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    // عد الشكاوى في نفس اليوم
    const count = await this.prisma.complaint.count({
      where: {
        createdAt: {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lt: new Date(date.setHours(23, 59, 59, 999)),
        },
      },
    });

    return `C${year}${month}${day}${String(count + 1).padStart(4, '0')}`;
  }

  // إنشاء شكوى جديدة (للمواطنين)
  async create(createComplaintDto: CreateComplaintDto, userId: string) {
    const referenceNumber = await this.generateReferenceNumber();

    const complaint = await this.prisma.complaint.create({
      data: {
        ...createComplaintDto,
        referenceNumber,
        citizenId: userId,
        priority: createComplaintDto.priority || 1,
      },
      include: {
        citizen: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        department: true,
      },
    });

    // إنشاء سجل في التاريخ
    await this.prisma.complaintHistory.create({
      data: {
        action: 'CREATE',
        newValue: ComplaintStatus.NEW,
        description: 'تم إنشاء الشكوى',
        complaintId: complaint.id,
        performedBy: userId,
      },
    });

    // إنشاء إشعار للمواطن
    await this.prisma.notification.create({
      data: {
        title: 'تم استلام شكواك',
        message: `تم استلام شكواك برقم مرجعي: ${referenceNumber}`,
        type: 'COMPLAINT_CREATED',
        userId,
        complaintId: complaint.id,
      },
    });

    // إشعار الموظفين في الجهة المختصة (إذا كانت محددة)
    if (complaint.departmentId) {
      const employees = await this.prisma.user.findMany({
        where: {
          departmentId: complaint.departmentId,
          role: { in: [UserRole.EMPLOYEE, UserRole.ADMIN] },
        },
      });

      for (const employee of employees) {
        await this.prisma.notification.create({
          data: {
            title: 'شكوى جديدة',
            message: `شكوى جديدة برقم مرجعي: ${referenceNumber}`,
            type: 'NEW_COMPLAINT',
            userId: employee.id,
            complaintId: complaint.id,
          },
        });
      }
    }

    // سجل تدقيق
    await this.prisma.auditLog.create({
      data: {
        action: 'CREATE_COMPLAINT',
        entity: 'Complaint',
        entityId: complaint.id,
        userId,
        details: JSON.stringify({ referenceNumber }),
      },
    });

    return {
      message: 'تم تقديم الشكوى بنجاح',
      complaint,
    };
  }

  // جلب جميع الشكاوى مع الفلترة والبحث
  async findAll(query: QueryComplaintDto, userId: string, userRole: UserRole) {
    const { status, departmentId, citizenId, search, page, limit } = query;

    const skip = (page! - 1) * limit!;

    // بناء شروط البحث
    const where: any = {};

    // حسب دور المستخدم
    if (userRole === UserRole.CITIZEN) {
      where.citizenId = userId; // المواطن يرى شكاواه فقط
    } else if (userRole === UserRole.EMPLOYEE) {
      // الموظف يرى شكاوى جهته فقط
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });
      if (user?.departmentId) {
        where.departmentId = user.departmentId;
      }
    }
    // المشرف العام يرى كل الشكاوى

    // الفلاتر الإضافية
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;
    if (citizenId) where.citizenId = citizenId;
    if (search) {
      where.OR = [
        { referenceNumber: { contains: search } },
        { description: { contains: search } },
        { type: { contains: search } },
      ];
    }

    const [complaints, total] = await Promise.all([
      this.prisma.complaint.findMany({
        where,
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
          department: true,
          assignedEmployee: {
            select: {
              id: true,
              name: true,
              email: true,
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
      this.prisma.complaint.count({ where }),
    ]);

    return {
      data: complaints,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit!),
      },
    };
  }

  // جلب شكوى واحدة بالتفاصيل
  async findOne(id: string, userId: string, userRole: UserRole) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id },
      include: {
        citizen: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        department: true,
        assignedEmployee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        attachments: true,
        comments: {
          orderBy: { createdAt: 'desc' },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
        history: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!complaint) {
      throw new NotFoundException('الشكوى غير موجودة');
    }

    // التحقق من الصلاحيات
    await this.checkComplaintAccess(complaint, userId, userRole);

    // فلترة التعليقات الداخلية للمواطنين
    if (userRole === UserRole.CITIZEN) {
      complaint.comments = complaint.comments.filter(
        (comment) => !comment.isInternal,
      );
    }

    return complaint;
  }

  // تحديث حالة الشكوى (للموظفين والمشرفين)
  async update(
    id: string,
    updateComplaintDto: UpdateComplaintDto,
    userId: string,
    userRole: UserRole,
  ) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id },
    });

    if (!complaint) {
      throw new NotFoundException('الشكوى غير موجودة');
    }

    // التحقق من الصلاحيات
    if (userRole === UserRole.CITIZEN) {
      throw new ForbiddenException('لا يمكن للمواطنين تعديل حالة الشكوى');
    }

    if (userRole === UserRole.EMPLOYEE) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });

      if (user?.departmentId !== complaint.departmentId) {
        throw new ForbiddenException('لا يمكنك تعديل شكاوى جهة أخرى');
      }
    }

    // التحقق من القفل (Locking)
    if (complaint.isLocked && complaint.lockedBy !== userId) {
      const lockedUser = await this.prisma.user.findUnique({
        where: { id: complaint.lockedBy! },
        select: { name: true },
      });
      throw new BadRequestException(
        `الشكوى محجوزة للمعالجة من قبل ${lockedUser?.name}`,
      );
    }

    const oldStatus = complaint.status;
    const updatedComplaint = await this.prisma.complaint.update({
      where: { id },
      data: updateComplaintDto,
      include: {
        citizen: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        department: true,
        assignedEmployee: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // تسجيل التغييرات في التاريخ
    if (updateComplaintDto.status && oldStatus !== updateComplaintDto.status) {
      await this.prisma.complaintHistory.create({
        data: {
          action: 'STATUS_CHANGE',
          oldValue: oldStatus,
          newValue: updateComplaintDto.status,
          description: `تم تغيير الحالة من ${oldStatus} إلى ${updateComplaintDto.status}`,
          complaintId: id,
          performedBy: userId,
        },
      });

      // إشعار المواطن بتغيير الحالة
      await this.prisma.notification.create({
        data: {
          title: 'تحديث حالة الشكوى',
          message: `تم تحديث حالة شكواك (${complaint.referenceNumber}) إلى: ${updateComplaintDto.status}`,
          type: 'STATUS_UPDATE',
          userId: complaint.citizenId,
          complaintId: id,
        },
      });
    }

    // سجل تدقيق
    await this.prisma.auditLog.create({
      data: {
        action: 'UPDATE_COMPLAINT',
        entity: 'Complaint',
        entityId: id,
        userId,
        details: JSON.stringify(updateComplaintDto),
      },
    });

    return {
      message: 'تم تحديث الشكوى بنجاح',
      complaint: updatedComplaint,
    };
  }

  // قفل الشكوى للمعالجة
  async lockComplaint(id: string, userId: string, userRole: UserRole) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id },
    });

    if (!complaint) {
      throw new NotFoundException('الشكوى غير موجودة');
    }

    if (userRole === UserRole.CITIZEN) {
      throw new ForbiddenException('لا يمكن للمواطنين قفل الشكاوى');
    }

    if (complaint.isLocked && complaint.lockedBy !== userId) {
      throw new BadRequestException('الشكوى محجوزة من قبل موظف آخر');
    }

    const updatedComplaint = await this.prisma.complaint.update({
      where: { id },
      data: {
        isLocked: true,
        lockedBy: userId,
        lockedAt: new Date(),
      },
    });

    return {
      message: 'تم حجز الشكوى للمعالجة',
      complaint: updatedComplaint,
    };
  }

  // إلغاء قفل الشكوى
  async unlockComplaint(id: string, userId: string, userRole: UserRole) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id },
    });

    if (!complaint) {
      throw new NotFoundException('الشكوى غير موجودة');
    }

    if (userRole !== UserRole.ADMIN && complaint.lockedBy !== userId) {
      throw new ForbiddenException(
        'لا يمكنك إلغاء حجز شكوى محجوزة من قبل موظف آخر',
      );
    }

    const updatedComplaint = await this.prisma.complaint.update({
      where: { id },
      data: {
        isLocked: false,
        lockedBy: null,
        lockedAt: null,
      },
    });

    return {
      message: 'تم إلغاء حجز الشكوى',
      complaint: updatedComplaint,
    };
  }

  // إضافة تعليق على الشكوى
  async addComment(
    complaintId: string,
    addCommentDto: AddCommentDto,
    userId: string,
    userRole: UserRole,
  ) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id: complaintId },
    });

    if (!complaint) {
      throw new NotFoundException('الشكوى غير موجودة');
    }

    // التحقق من الصلاحيات
    await this.checkComplaintAccess(complaint, userId, userRole);

    const comment = await this.prisma.comment.create({
      data: {
        content: addCommentDto.content,
        isInternal: addCommentDto.isInternal || false,
        complaintId,
        authorId: userId,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    // تسجيل في التاريخ
    await this.prisma.complaintHistory.create({
      data: {
        action: 'ADD_COMMENT',
        description: addCommentDto.isInternal
          ? 'تم إضافة ملاحظة داخلية'
          : 'تم إضافة تعليق',
        complaintId,
        performedBy: userId,
      },
    });

    // إشعار المواطن (إذا كان التعليق ليس داخلي)
    if (!addCommentDto.isInternal && userId !== complaint.citizenId) {
      await this.prisma.notification.create({
        data: {
          title: 'تعليق جديد على شكواك',
          message: `تم إضافة تعليق جديد على شكواك (${complaint.referenceNumber})`,
          type: 'NEW_COMMENT',
          userId: complaint.citizenId,
          complaintId,
        },
      });
    }

    return {
      message: 'تم إضافة التعليق بنجاح',
      comment,
    };
  }

  // حذف شكوى (للمشرف العام فقط)
  async remove(id: string, userRole: UserRole) {
    if (userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('فقط المشرف العام يمكنه حذف الشكاوى');
    }

    const complaint = await this.prisma.complaint.findUnique({
      where: { id },
    });

    if (!complaint) {
      throw new NotFoundException('الشكوى غير موجودة');
    }

    await this.prisma.complaint.delete({
      where: { id },
    });

    return {
      message: 'تم حذف الشكوى بنجاح',
    };
  }

  // التحقق من صلاحية الوصول للشكوى
  private async checkComplaintAccess(
    complaint: any,
    userId: string,
    userRole: UserRole,
  ) {
    if (userRole === UserRole.ADMIN) {
      return; // المشرف العام يمكنه الوصول لكل الشكاوى
    }

    if (userRole === UserRole.CITIZEN) {
      if (complaint.citizenId !== userId) {
        throw new ForbiddenException('لا يمكنك الوصول لهذه الشكوى');
      }
      return;
    }

    if (userRole === UserRole.EMPLOYEE) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });

      if (user?.departmentId !== complaint.departmentId) {
        throw new ForbiddenException('لا يمكنك الوصول لشكاوى جهة أخرى');
      }
    }
  }

  // إحصائيات الشكاوى (للمشرف والموظفين)
  async getStatistics(userId: string, userRole: UserRole) {
    const where: any = {};

    if (userRole === UserRole.EMPLOYEE) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });
      if (user?.departmentId) {
        where.departmentId = user.departmentId;
      }
    }

    const [total, newCount, inProgressCount, completedCount, rejectedCount] =
      await Promise.all([
        this.prisma.complaint.count({ where }),
        this.prisma.complaint.count({
          where: { ...where, status: ComplaintStatus.NEW },
        }),
        this.prisma.complaint.count({
          where: { ...where, status: ComplaintStatus.IN_PROGRESS },
        }),
        this.prisma.complaint.count({
          where: { ...where, status: ComplaintStatus.COMPLETED },
        }),
        this.prisma.complaint.count({
          where: { ...where, status: ComplaintStatus.REJECTED },
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
}
