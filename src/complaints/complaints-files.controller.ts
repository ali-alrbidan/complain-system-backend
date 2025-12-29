// src/complaints/complaints-files.controller.ts
import {
  Controller,
  Post,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  Get,
  Res,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Response } from 'express';

@Controller('complaints')
@UseGuards(JwtAuthGuard)
export class ComplaintsFilesController {
  constructor(private prisma: PrismaService) {}

  // رفع مرفقات للشكوى
  @Post(':id/attachments')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = './uploads/complaints';
          if (!existsSync(uploadPath)) {
            mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        // السماح فقط بالصور والملفات PDF
        const allowedMimes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/gif',
          'application/pdf',
        ];

        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'نوع الملف غير مسموح. يرجى رفع صور أو ملفات PDF فقط',
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  async uploadAttachments(
    @Param('id') complaintId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: any,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('لم يتم رفع أي ملفات');
    }

    // التحقق من وجود الشكوى والصلاحيات
    const complaint = await this.prisma.complaint.findUnique({
      where: { id: complaintId },
    });

    if (!complaint) {
      throw new BadRequestException('الشكوى غير موجودة');
    }

    // المواطن يمكنه فقط رفع ملفات لشكاواه
    if (user.role === 'CITIZEN' && complaint.citizenId !== user.id) {
      throw new BadRequestException('لا يمكنك رفع ملفات لهذه الشكوى');
    }

    // حفظ المرفقات في قاعدة البيانات
    const attachments = await Promise.all(
      files.map((file) =>
        this.prisma.attachment.create({
          data: {
            filename: file.filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            path: file.path,
            complaintId,
          },
        }),
      ),
    );

    // تسجيل في التاريخ
    await this.prisma.complaintHistory.create({
      data: {
        action: 'ADD_ATTACHMENTS',
        description: `تم رفع ${files.length} مرفق`,
        complaintId,
        performedBy: user.id,
      },
    });

    return {
      message: 'تم رفع المرفقات بنجاح',
      attachments,
    };
  }

  // تحميل مرفق
  @Get('attachments/:id')
  async downloadAttachment(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: {
        complaint: true,
      },
    });

    if (!attachment) {
      throw new BadRequestException('المرفق غير موجود');
    }

    // التحقق من الصلاحيات
    const complaint = attachment.complaint;
    if (user.role === 'CITIZEN' && complaint.citizenId !== user.id) {
      throw new BadRequestException('لا يمكنك الوصول لهذا المرفق');
    }

    if (
      user.role === 'EMPLOYEE' &&
      complaint.departmentId !== user.departmentId
    ) {
      throw new BadRequestException('لا يمكنك الوصول لهذا المرفق');
    }

    // إرسال الملف
    res.sendFile(join(process.cwd(), attachment.path));
  }
}
