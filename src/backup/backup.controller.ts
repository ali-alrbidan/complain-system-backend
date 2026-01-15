// // ============================================
// // src/backup/backup.controller.ts
// // ============================================

// import {
//   Controller,
//   Get,
//   Post,
//   Param,
//   UseGuards,
//   Res,
//   Delete,
// } from '@nestjs/common';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { Roles } from '../auth/decorators/roles.decorator';
// import { UserRole } from 'generated/prisma/enums';
// import { BackupService } from './backup.service';
// import * as path from 'path';

// @Controller('backup')
// @UseGuards(JwtAuthGuard)
// @Roles(UserRole.ADMIN)
// export class BackupController {
//   constructor(private backupService: BackupService) {}

//   @Post('create')
//   async createBackup() {
//     return this.backupService.createBackup('manual');
//   }

//   @Get('list')
//   async listBackups() {
//     return this.backupService.listBackups();
//   }

//   @Post('restore/:name')
//   async restoreBackup(@Param('name') name: string) {
//     return this.backupService.restoreBackup(name);
//   }

//   // حذف نسخة احتياطية
//   @Delete('delete/:name')
//   @Roles(UserRole.ADMIN)
//   async deleteBackup(@Param('name') name: string) {
//     return this.backupService.deleteBackup(name);
//   }
// }

// src/backup/backup.controller.ts
import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Res,
  Delete,
  StreamableFile,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from 'generated/prisma/enums';
import { BackupService } from './backup.service';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { join } from 'path';

@Controller('backup')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN)
export class BackupController {
  constructor(private backupService: BackupService) {}

  @Post('create')
  async createBackup() {
    return this.backupService.createBackup('manual');
  }

  @Get('list')
  async listBackups() {
    return this.backupService.listBackups();
  }

  @Post('restore/:name')
  async restoreBackup(@Param('name') name: string) {
    // return this.backupService.restoreBackup(name);

    const result = await this.backupService.restoreBackup(name);
    if (result.requiresReload) {
      return {
        ...result,
        message: 'تم استعادة النسخة الاحتياطية بنجاح. يُرجى تحديث الصفحة.',
      };
    }
  }

  // ✅ تحميل نسخة احتياطية - مُصلح
  @Get('download/:name')
  async downloadBackup(
    @Param('name') name: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const backupPath = await this.backupService.getBackupPath(name);

      // التحقق من وجود الملف
      try {
        await stat(backupPath);
      } catch (error) {
        throw new NotFoundException('النسخة الاحتياطية غير موجودة');
      }

      // إعداد الـ headers
      res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${name}"`,
      });

      // إنشاء stream للقراءة
      const file = createReadStream(backupPath);

      return new StreamableFile(file);
    } catch (error) {
      throw new NotFoundException('فشل تحميل النسخة الاحتياطية');
    }
  }

  // ✅ حذف نسخة احتياطية
  @Delete('delete/:name')
  async deleteBackup(@Param('name') name: string) {
    return this.backupService.deleteBackup(name);
  }
}
