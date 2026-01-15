// // src/backup/backup.service.ts
// // النسخ الاحتياطي التلقائي لقاعدة البيانات

// import { Injectable, Logger, NotFoundException } from '@nestjs/common';
// import { Cron, CronExpression } from '@nestjs/schedule';
// import { PrismaService } from '../prisma/prisma.service';
// import { exec } from 'child_process';
// import { promisify } from 'util';
// import * as fs from 'fs/promises';
// import * as path from 'path';
// import * as archiver from 'archiver';

// const execAsync = promisify(exec);

// @Injectable()
// export class BackupService {
//   private readonly logger = new Logger(BackupService.name);
//   private readonly backupDir = path.join(process.cwd(), 'backups');

//   constructor(private prisma: PrismaService) {
//     this.ensureBackupDirectory();
//   }

//   private async ensureBackupDirectory() {
//     try {
//       await fs.mkdir(this.backupDir, { recursive: true });
//     } catch (error) {
//       this.logger.error('Failed to create backup directory', error);
//     }
//   }

//   // نسخ احتياطي يومي في الساعة 2 صباحاً
//   @Cron('0 2 * * *')
//   async performDailyBackup() {
//     this.logger.log('Starting daily backup...');
//     await this.createBackup('daily');
//   }

//   // نسخ احتياطي أسبوعي كل يوم أحد الساعة 3 صباحاً
//   @Cron('0 3 * * 0')
//   async performWeeklyBackup() {
//     this.logger.log('Starting weekly backup...');
//     await this.createBackup('weekly');
//   }

//   async createBackup(type: 'daily' | 'weekly' | 'manual' = 'manual') {
//     const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
//     const backupName = `backup_${type}_${timestamp}`;
//     const backupPath = path.join(this.backupDir, backupName);

//     try {
//       // إنشاء مجلد للنسخة الاحتياطية
//       await fs.mkdir(backupPath, { recursive: true });

//       // 1. نسخ قاعدة البيانات (SQLite)
//       await this.backupDatabase(backupPath);

//       // 2. نسخ المرفقات (الصور والمستندات)
//       await this.backupAttachments(backupPath);

//       // 3. ضغط النسخة الاحتياطية
//       const zipPath = await this.compressBackup(backupPath, backupName);

//       // 4. تسجيل النسخة الاحتياطية في قاعدة البيانات
//       await this.recordBackup(backupName, zipPath, type);

//       // 5. حذف النسخ القديمة (الاحتفاظ بآخر 7 نسخ يومية و 4 أسبوعية)
//       await this.cleanOldBackups(type);

//       this.logger.log(`Backup completed successfully: ${zipPath}`);

//       return {
//         success: true,
//         backupName,
//         path: zipPath,
//       };
//     } catch (error) {
//       this.logger.error('Backup failed', error);
//       throw error;
//     }
//   }

//   private async backupDatabase(backupPath: string) {
//     const dbPath = path.join(process.cwd(), '', 'dev.db');
//     const dbBackupPath = path.join(backupPath, 'database.db');

//     try {
//       // نسخ ملف قاعدة البيانات SQLite
//       await fs.copyFile(dbPath, dbBackupPath);

//       this.logger.log('Database backup completed');
//     } catch (error) {
//       this.logger.error('Database backup failed', error);
//       throw error;
//     }
//   }

//   private async backupAttachments(backupPath: string) {
//     const uploadsPath = path.join(process.cwd(), 'uploads');
//     const attachmentsBackupPath = path.join(backupPath, 'uploads');

//     try {
//       // نسخ مجلد المرفقات
//       await this.copyDirectory(uploadsPath, attachmentsBackupPath);

//       this.logger.log('Attachments backup completed');
//     } catch (error) {
//       this.logger.error('Attachments backup failed', error);
//       // لا نرمي خطأ - المرفقات قد لا تكون موجودة
//     }
//   }

//   private async copyDirectory(src: string, dest: string) {
//     try {
//       await fs.mkdir(dest, { recursive: true });
//       const entries = await fs.readdir(src, { withFileTypes: true });

//       for (const entry of entries) {
//         const srcPath = path.join(src, entry.name);
//         const destPath = path.join(dest, entry.name);

//         if (entry.isDirectory()) {
//           await this.copyDirectory(srcPath, destPath);
//         } else {
//           await fs.copyFile(srcPath, destPath);
//         }
//       }
//     } catch (error) {
//       // المجلد قد لا يكون موجوداً
//     }
//   }

//   private async compressBackup(
//     backupPath: string,
//     backupName: string,
//   ): Promise<string> {
//     const zipPath = path.join(this.backupDir, `${backupName}.zip`);

//     return new Promise((resolve, reject) => {
//       const output = require('fs').createWriteStream(zipPath);
//       const archive = archiver('zip', { zlib: { level: 9 } });

//       output.on('close', () => {
//         this.logger.log(`Backup compressed: ${archive.pointer()} bytes`);
//         // حذف المجلد غير المضغوط
//         fs.rm(backupPath, { recursive: true });
//         resolve(zipPath);
//       });

//       archive.on('error', (err) => reject(err));

//       archive.pipe(output);
//       archive.directory(backupPath, false);
//       archive.finalize();
//     });
//   }

//   private async recordBackup(name: string, path: string, type: string) {
//     const stats = await fs.stat(path);

//     // يمكنك إنشاء جدول Backup في Prisma أو استخدام AuditLog
//     await this.prisma.auditLog.create({
//       data: {
//         action: 'BACKUP_CREATED',
//         entity: 'System',
//         entityId: name,
//         details: JSON.stringify({
//           type,
//           path,
//           size: stats.size,
//           timestamp: new Date().toISOString(),
//         }),
//       },
//     });
//   }

//   private async cleanOldBackups(type: string) {
//     const maxBackups = type === 'daily' ? 7 : 4;

//     try {
//       const files = await fs.readdir(this.backupDir);
//       const backups = files
//         .filter((f) => f.startsWith(`backup_${type}_`) && f.endsWith('.zip'))
//         .map((f) => ({
//           name: f,
//           path: path.join(this.backupDir, f),
//           time: fs.stat(path.join(this.backupDir, f)).then((s) => s.mtime),
//         }));

//       const sorted = await Promise.all(
//         backups.map(async (b) => ({
//           ...b,
//           time: await b.time,
//         })),
//       );

//       sorted.sort((a, b) => b.time.getTime() - a.time.getTime());

//       // حذف النسخ الزائدة
//       for (let i = maxBackups; i < sorted.length; i++) {
//         await fs.unlink(sorted[i].path);
//         this.logger.log(`Deleted old backup: ${sorted[i].name}`);
//       }
//     } catch (error) {
//       this.logger.error('Failed to clean old backups', error);
//     }
//   }

//   // استعادة نسخة احتياطية
//   async restoreBackup(backupName: string) {
//     const zipPath = path.join(this.backupDir, `${backupName}.zip`);
//     const restorePath = path.join(this.backupDir, 'restore_temp');

//     try {
//       // فك ضغط النسخة
//       await execAsync(`unzip -o "${zipPath}" -d "${restorePath}"`);

//       // استعادة قاعدة البيانات
//       const dbBackupPath = path.join(restorePath, 'database.db');
//       const dbPath = path.join(process.cwd(), '', 'dev.db');
//       await fs.copyFile(dbBackupPath, dbPath);

//       // استعادة المرفقات
//       const uploadsBackupPath = path.join(restorePath, 'uploads');
//       const uploadsPath = path.join(process.cwd(), 'uploads');
//       await this.copyDirectory(uploadsBackupPath, uploadsPath);

//       // حذف مجلد الاستعادة المؤقت
//       await fs.rm(restorePath, { recursive: true });

//       this.logger.log(`Backup restored successfully: ${backupName}`);

//       return { success: true, message: 'تم استعادة النسخة الاحتياطية بنجاح' };
//     } catch (error) {
//       this.logger.error('Restore failed', error);
//       throw error;
//     }
//   }

//   // الحصول على قائمة النسخ الاحتياطية
//   async listBackups() {
//     try {
//       const files = await fs.readdir(this.backupDir);
//       const backups = await Promise.all(
//         files
//           .filter((f) => f.endsWith('.zip'))
//           .map(async (f) => {
//             const filePath = path.join(this.backupDir, f);
//             const stats = await fs.stat(filePath);
//             return {
//               name: f,
//               size: stats.size,
//               created: stats.birthtime,
//             };
//           }),
//       );

//       return backups.sort((a, b) => b.created.getTime() - a.created.getTime());
//     } catch (error) {
//       this.logger.error('Failed to list backups', error);
//       return [];
//     }
//   }
//   async deleteBackup(backupName: string) {
//     const backupPath = path.join(this.backupDir, backupName);

//     try {
//       await fs.unlink(backupPath);

//       this.logger.log(`Backup deleted: ${backupName}`);

//       return {
//         success: true,
//         message: 'تم حذف النسخة الاحتياطية بنجاح',
//       };
//     } catch (error) {
//       this.logger.error('Failed to delete backup', error);
//       throw new NotFoundException('النسخة الاحتياطية غير موجودة');
//     }
//   }
// }

// // src/backup/backup.service.ts - النسخ المُصلحة
// import {
//   Injectable,
//   Logger,
//   NotFoundException,
//   InternalServerErrorException,
// } from '@nestjs/common';
// import { Cron } from '@nestjs/schedule';
// import { PrismaService } from '../prisma/prisma.service';
// import { exec } from 'child_process';
// import { promisify } from 'util';
// import * as fs from 'fs/promises';
// import * as path from 'path';
// import * as archiver from 'archiver';
// import { createReadStream, createWriteStream } from 'fs';
// import * as AdmZip from 'adm-zip';

// const execAsync = promisify(exec);

// @Injectable()
// export class BackupService {
//   private readonly logger = new Logger(BackupService.name);
//   public readonly backupDir = path.join(process.cwd(), 'backups'); // ✅ جعلها public

//   constructor(private prisma: PrismaService) {
//     this.ensureBackupDirectory();
//   }

//   private async ensureBackupDirectory() {
//     try {
//       await fs.mkdir(this.backupDir, { recursive: true });
//       this.logger.log(`Backup directory ready: ${this.backupDir}`);
//     } catch (error) {
//       this.logger.error('Failed to create backup directory', error);
//     }
//   }

//   // نسخ احتياطي يومي في الساعة 2 صباحاً
//   @Cron('0 2 * * *')
//   async performDailyBackup() {
//     this.logger.log('Starting daily backup...');
//     await this.createBackup('daily');
//   }

//   // نسخ احتياطي أسبوعي كل يوم أحد الساعة 3 صباحاً
//   @Cron('0 3 * * 0')
//   async performWeeklyBackup() {
//     this.logger.log('Starting weekly backup...');
//     await this.createBackup('weekly');
//   }

//   async createBackup(type: 'daily' | 'weekly' | 'manual' = 'manual') {
//     const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
//     const backupName = `backup_${type}_${timestamp}`;
//     const backupPath = path.join(this.backupDir, backupName);

//     try {
//       // إنشاء مجلد للنسخة الاحتياطية
//       await fs.mkdir(backupPath, { recursive: true });

//       // 1. نسخ قاعدة البيانات (SQLite)
//       await this.backupDatabase(backupPath);

//       // 2. نسخ المرفقات (الصور والمستندات)
//       await this.backupAttachments(backupPath);

//       // 3. ضغط النسخة الاحتياطية
//       const zipPath = await this.compressBackup(backupPath, backupName);

//       // 4. تسجيل النسخة الاحتياطية في قاعدة البيانات
//       await this.recordBackup(backupName, zipPath, type);

//       // 5. حذف النسخ القديمة
//       await this.cleanOldBackups(type);

//       this.logger.log(`Backup completed successfully: ${zipPath}`);

//       return {
//         success: true,
//         backupName: `${backupName}.zip`,
//         path: zipPath,
//       };
//     } catch (error) {
//       this.logger.error('Backup failed', error);
//       throw new InternalServerErrorException('فشل إنشاء النسخة الاحتياطية');
//     }
//   }

//   private async backupDatabase(backupPath: string) {
//     const dbPath = path.join(process.cwd(), 'dev.db');
//     const dbBackupPath = path.join(backupPath, 'database.db');

//     try {
//       await fs.copyFile(dbPath, dbBackupPath);
//       this.logger.log('Database backup completed');
//     } catch (error) {
//       this.logger.error('Database backup failed', error);
//       throw error;
//     }
//   }

//   private async backupAttachments(backupPath: string) {
//     const uploadsPath = path.join(process.cwd(), 'uploads');
//     const attachmentsBackupPath = path.join(backupPath, 'uploads');

//     try {
//       await this.copyDirectory(uploadsPath, attachmentsBackupPath);
//       this.logger.log('Attachments backup completed');
//     } catch (error) {
//       this.logger.warn('Attachments backup skipped (folder may not exist)');
//     }
//   }

//   private async copyDirectory(src: string, dest: string) {
//     try {
//       await fs.mkdir(dest, { recursive: true });
//       const entries = await fs.readdir(src, { withFileTypes: true });

//       for (const entry of entries) {
//         const srcPath = path.join(src, entry.name);
//         const destPath = path.join(dest, entry.name);

//         if (entry.isDirectory()) {
//           await this.copyDirectory(srcPath, destPath);
//         } else {
//           await fs.copyFile(srcPath, destPath);
//         }
//       }
//     } catch (error) {
//       // المجلد قد لا يكون موجوداً
//     }
//   }

//   private async compressBackup(
//     backupPath: string,
//     backupName: string,
//   ): Promise<string> {
//     const zipPath = path.join(this.backupDir, `${backupName}.zip`);

//     return new Promise((resolve, reject) => {
//       const output = createWriteStream(zipPath);
//       const archive = archiver('zip', { zlib: { level: 9 } });

//       output.on('close', async () => {
//         this.logger.log(`Backup compressed: ${archive.pointer()} bytes`);
//         // حذف المجلد غير المضغوط
//         try {
//           await fs.rm(backupPath, { recursive: true, force: true });
//         } catch (error) {
//           this.logger.warn('Failed to delete temp backup folder');
//         }
//         resolve(zipPath);
//       });

//       archive.on('error', (err) => reject(err));

//       archive.pipe(output);
//       archive.directory(backupPath, false);
//       archive.finalize();
//     });
//   }

//   private async recordBackup(name: string, filePath: string, type: string) {
//     try {
//       const stats = await fs.stat(filePath);

//       await this.prisma.auditLog.create({
//         data: {
//           action: 'BACKUP_CREATED',
//           entity: 'System',
//           entityId: name,
//           details: JSON.stringify({
//             type,
//             path: filePath,
//             size: stats.size,
//             timestamp: new Date().toISOString(),
//           }),
//         },
//       });
//     } catch (error) {
//       this.logger.error('Failed to record backup in database', error);
//     }
//   }

//   private async cleanOldBackups(type: string) {
//     const maxBackups = type === 'daily' ? 7 : 4;

//     try {
//       const files = await fs.readdir(this.backupDir);
//       const backups = files
//         .filter((f) => f.startsWith(`backup_${type}_`) && f.endsWith('.zip'))
//         .map((f) => ({
//           name: f,
//           path: path.join(this.backupDir, f),
//           time: fs.stat(path.join(this.backupDir, f)).then((s) => s.mtime),
//         }));

//       const sorted = await Promise.all(
//         backups.map(async (b) => ({
//           ...b,
//           time: await b.time,
//         })),
//       );

//       sorted.sort((a, b) => b.time.getTime() - a.time.getTime());

//       // حذف النسخ الزائدة
//       for (let i = maxBackups; i < sorted.length; i++) {
//         await fs.unlink(sorted[i].path);
//         this.logger.log(`Deleted old backup: ${sorted[i].name}`);
//       }
//     } catch (error) {
//       this.logger.error('Failed to clean old backups', error);
//     }
//   }

//   // ✅ استعادة نسخة احتياطية - مُصلح
//   async restoreBackup(backupName: string) {
//     const zipPath = path.join(this.backupDir, backupName);
//     const restorePath = path.join(this.backupDir, 'restore_temp');

//     try {
//       // التحقق من وجود الملف
//       try {
//         await fs.access(zipPath);
//       } catch {
//         throw new NotFoundException('النسخة الاحتياطية غير موجودة');
//       }

//       // إنشاء مجلد مؤقت للاستعادة
//       await fs.mkdir(restorePath, { recursive: true });

//       // فك ضغط النسخة باستخدام adm-zip (أفضل من unzip)
//       const zip = new AdmZip(zipPath);
//       zip.extractAllTo(restorePath, true);

//       this.logger.log('Backup extracted successfully');

//       // استعادة قاعدة البيانات
//       const dbBackupPath = path.join(restorePath, 'database.db');
//       const dbPath = path.join(process.cwd(), 'dev.db');

//       try {
//         await fs.access(dbBackupPath);
//         await fs.copyFile(dbBackupPath, dbPath);
//         this.logger.log('Database restored successfully');
//       } catch (error) {
//         this.logger.error('Database restore failed', error);
//         throw new InternalServerErrorException('فشل استعادة قاعدة البيانات');
//       }

//       // استعادة المرفقات
//       const uploadsBackupPath = path.join(restorePath, 'uploads');
//       const uploadsPath = path.join(process.cwd(), 'uploads');

//       try {
//         await fs.access(uploadsBackupPath);
//         // حذف المرفقات القديمة
//         await fs.rm(uploadsPath, { recursive: true, force: true });
//         // نسخ المرفقات الجديدة
//         await this.copyDirectory(uploadsBackupPath, uploadsPath);
//         this.logger.log('Attachments restored successfully');
//       } catch (error) {
//         this.logger.warn('Attachments restore skipped (may not exist)');
//       }

//       // حذف مجلد الاستعادة المؤقت
//       await fs.rm(restorePath, { recursive: true, force: true });

//       this.logger.log(`Backup restored successfully: ${backupName}`);

//       // تسجيل في Audit Log
//       await this.prisma.auditLog.create({
//         data: {
//           action: 'BACKUP_RESTORED',
//           entity: 'System',
//           entityId: backupName,
//           details: JSON.stringify({
//             backupName,
//             restoredAt: new Date().toISOString(),
//           }),
//         },
//       });

//       return { success: true, message: 'تم استعادة النسخة الاحتياطية بنجاح' };
//     } catch (error) {
//       this.logger.error('Restore failed', error);

//       // تنظيف مجلد الاستعادة المؤقت في حالة الفشل
//       try {
//         await fs.rm(restorePath, { recursive: true, force: true });
//       } catch {}

//       if (error instanceof NotFoundException) {
//         throw error;
//       }

//       throw new InternalServerErrorException('فشل استعادة النسخة الاحتياطية');
//     }
//   }

//   // ✅ الحصول على قائمة النسخ الاحتياطية
//   async listBackups() {
//     try {
//       const files = await fs.readdir(this.backupDir);
//       const backups = await Promise.all(
//         files
//           .filter((f) => f.endsWith('.zip'))
//           .map(async (f) => {
//             const filePath = path.join(this.backupDir, f);
//             const stats = await fs.stat(filePath);
//             return {
//               name: f,
//               size: stats.size,
//               created: stats.birthtime,
//             };
//           }),
//       );

//       return backups.sort((a, b) => b.created.getTime() - a.created.getTime());
//     } catch (error) {
//       this.logger.error('Failed to list backups', error);
//       return [];
//     }
//   }

//   // ✅ حذف نسخة احتياطية
//   async deleteBackup(backupName: string) {
//     const backupPath = path.join(this.backupDir, backupName);

//     try {
//       await fs.unlink(backupPath);

//       this.logger.log(`Backup deleted: ${backupName}`);

//       // تسجيل في Audit Log
//       await this.prisma.auditLog.create({
//         data: {
//           action: 'BACKUP_DELETED',
//           entity: 'System',
//           entityId: backupName,
//           details: JSON.stringify({
//             backupName,
//             deletedAt: new Date().toISOString(),
//           }),
//         },
//       });

//       return {
//         success: true,
//         message: 'تم حذف النسخة الاحتياطية بنجاح',
//       };
//     } catch (error) {
//       this.logger.error('Failed to delete backup', error);
//       throw new NotFoundException('النسخة الاحتياطية غير موجودة');
//     }
//   }

//   // ✅ الحصول على مسار النسخة الاحتياطية
//   async getBackupPath(backupName: string): Promise<string> {
//     return path.join(this.backupDir, backupName);
//   }
// }

// src/backup/backup.service.ts - النسخ المُصلحة مع إصلاح مشكلة الاستعادة
import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as archiver from 'archiver';
import { createReadStream, createWriteStream } from 'fs';
import * as AdmZip from 'adm-zip';

const execAsync = promisify(exec);

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  public readonly backupDir = path.join(process.cwd(), 'backups');

  constructor(private prisma: PrismaService) {
    this.ensureBackupDirectory();
  }

  private async ensureBackupDirectory() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      this.logger.log(`Backup directory ready: ${this.backupDir}`);
    } catch (error) {
      this.logger.error('Failed to create backup directory', error);
    }
  }

  @Cron('0 2 * * *')
  async performDailyBackup() {
    this.logger.log('Starting daily backup...');
    await this.createBackup('daily');
  }

  @Cron('0 3 * * 0')
  async performWeeklyBackup() {
    this.logger.log('Starting weekly backup...');
    await this.createBackup('weekly');
  }

  async createBackup(type: 'daily' | 'weekly' | 'manual' = 'manual') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup_${type}_${timestamp}`;
    const backupPath = path.join(this.backupDir, backupName);

    try {
      await fs.mkdir(backupPath, { recursive: true });
      await this.backupDatabase(backupPath);
      await this.backupAttachments(backupPath);
      const zipPath = await this.compressBackup(backupPath, backupName);
      await this.recordBackup(backupName, zipPath, type);
      await this.cleanOldBackups(type);

      this.logger.log(`Backup completed successfully: ${zipPath}`);

      return {
        success: true,
        backupName: `${backupName}.zip`,
        path: zipPath,
      };
    } catch (error) {
      this.logger.error('Backup failed', error);
      throw new InternalServerErrorException('فشل إنشاء النسخة الاحتياطية');
    }
  }

  private async backupDatabase(backupPath: string) {
    const dbPath = path.join(process.cwd(), 'dev.db');
    const dbBackupPath = path.join(backupPath, 'database.db');

    try {
      await fs.copyFile(dbPath, dbBackupPath);
      this.logger.log('Database backup completed');
    } catch (error) {
      this.logger.error('Database backup failed', error);
      throw error;
    }
  }

  private async backupAttachments(backupPath: string) {
    const uploadsPath = path.join(process.cwd(), 'uploads');
    const attachmentsBackupPath = path.join(backupPath, 'uploads');

    try {
      await this.copyDirectory(uploadsPath, attachmentsBackupPath);
      this.logger.log('Attachments backup completed');
    } catch (error) {
      this.logger.warn('Attachments backup skipped (folder may not exist)');
    }
  }

  private async copyDirectory(src: string, dest: string) {
    try {
      await fs.mkdir(dest, { recursive: true });
      const entries = await fs.readdir(src, { withFileTypes: true });

      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
          await this.copyDirectory(srcPath, destPath);
        } else {
          await fs.copyFile(srcPath, destPath);
        }
      }
    } catch (error) {
      // المجلد قد لا يكون موجوداً
    }
  }

  private async compressBackup(
    backupPath: string,
    backupName: string,
  ): Promise<string> {
    const zipPath = path.join(this.backupDir, `${backupName}.zip`);

    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', async () => {
        this.logger.log(`Backup compressed: ${archive.pointer()} bytes`);
        try {
          await fs.rm(backupPath, { recursive: true, force: true });
        } catch (error) {
          this.logger.warn('Failed to delete temp backup folder');
        }
        resolve(zipPath);
      });

      archive.on('error', (err) => reject(err));

      archive.pipe(output);
      archive.directory(backupPath, false);
      archive.finalize();
    });
  }

  private async recordBackup(name: string, filePath: string, type: string) {
    try {
      const stats = await fs.stat(filePath);

      await this.prisma.auditLog.create({
        data: {
          action: 'BACKUP_CREATED',
          entity: 'System',
          entityId: name,
          details: JSON.stringify({
            type,
            path: filePath,
            size: stats.size,
            timestamp: new Date().toISOString(),
          }),
        },
      });
    } catch (error) {
      this.logger.error('Failed to record backup in database', error);
    }
  }

  private async cleanOldBackups(type: string) {
    const maxBackups = type === 'daily' ? 7 : 4;

    try {
      const files = await fs.readdir(this.backupDir);
      const backups = files
        .filter((f) => f.startsWith(`backup_${type}_`) && f.endsWith('.zip'))
        .map((f) => ({
          name: f,
          path: path.join(this.backupDir, f),
          time: fs.stat(path.join(this.backupDir, f)).then((s) => s.mtime),
        }));

      const sorted = await Promise.all(
        backups.map(async (b) => ({
          ...b,
          time: await b.time,
        })),
      );

      sorted.sort((a, b) => b.time.getTime() - a.time.getTime());

      for (let i = maxBackups; i < sorted.length; i++) {
        await fs.unlink(sorted[i].path);
        this.logger.log(`Deleted old backup: ${sorted[i].name}`);
      }
    } catch (error) {
      this.logger.error('Failed to clean old backups', error);
    }
  }

  // ✅ استعادة نسخة احتياطية - مُصلح تماماً
  async restoreBackup(backupName: string) {
    const zipPath = path.join(this.backupDir, backupName);
    const restorePath = path.join(this.backupDir, 'restore_temp');

    try {
      // التحقق من وجود الملف
      try {
        await fs.access(zipPath);
      } catch {
        throw new NotFoundException('النسخة الاحتياطية غير موجودة');
      }

      // إنشاء مجلد مؤقت للاستعادة
      await fs.mkdir(restorePath, { recursive: true });

      // فك ضغط النسخة
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(restorePath, true);
      this.logger.log('Backup extracted successfully');

      // ✅ الحل 1: قطع الاتصال بقاعدة البيانات قبل الاستعادة
      await this.prisma.$disconnect();
      this.logger.log('Disconnected from database');

      // استعادة قاعدة البيانات
      const dbBackupPath = path.join(restorePath, 'database.db');
      const dbPath = path.join(process.cwd(), 'dev.db');

      try {
        await fs.access(dbBackupPath);

        // حذف قاعدة البيانات القديمة
        try {
          await fs.unlink(dbPath);
        } catch (error) {
          this.logger.warn('Old database file not found or already deleted');
        }

        // نسخ قاعدة البيانات الجديدة
        await fs.copyFile(dbBackupPath, dbPath);
        this.logger.log('Database file restored successfully');
      } catch (error) {
        this.logger.error('Database restore failed', error);
        throw new InternalServerErrorException('فشل استعادة قاعدة البيانات');
      }

      // ✅ الحل 2: إعادة الاتصال بقاعدة البيانات
      await this.prisma.$connect();
      this.logger.log('Reconnected to database');

      // ✅ الحل 3: التحقق من الاستعادة بقراءة سجل من القاعدة
      try {
        const testQuery = await this.prisma.auditLog.findFirst();
        this.logger.log('Database connection verified after restore');
      } catch (error) {
        this.logger.error('Database verification failed', error);
        throw new InternalServerErrorException(
          'فشل التحقق من قاعدة البيانات المستعادة',
        );
      }

      // استعادة المرفقات
      const uploadsBackupPath = path.join(restorePath, 'uploads');
      const uploadsPath = path.join(process.cwd(), 'uploads');

      try {
        await fs.access(uploadsBackupPath);
        await fs.rm(uploadsPath, { recursive: true, force: true });
        await this.copyDirectory(uploadsBackupPath, uploadsPath);
        this.logger.log('Attachments restored successfully');
      } catch (error) {
        this.logger.warn('Attachments restore skipped (may not exist)');
      }

      // حذف مجلد الاستعادة المؤقت
      await fs.rm(restorePath, { recursive: true, force: true });

      this.logger.log(`Backup restored successfully: ${backupName}`);

      // تسجيل في Audit Log
      await this.prisma.auditLog.create({
        data: {
          action: 'BACKUP_RESTORED',
          entity: 'System',
          entityId: backupName,
          details: JSON.stringify({
            backupName,
            restoredAt: new Date().toISOString(),
          }),
        },
      });

      return {
        success: true,
        message:
          'تم استعادة النسخة الاحتياطية بنجاح. قد تحتاج لتحديث الصفحة لرؤية التغييرات.',
        requiresReload: true, // ✅ إشارة للواجهة الأمامية لإعادة التحميل
      };
    } catch (error) {
      this.logger.error('Restore failed', error);

      // إعادة الاتصال في حالة الفشل
      try {
        await this.prisma.$connect();
      } catch (reconnectError) {
        this.logger.error(
          'Failed to reconnect after restore failure',
          reconnectError,
        );
      }

      // تنظيف مجلد الاستعادة المؤقت
      try {
        await fs.rm(restorePath, { recursive: true, force: true });
      } catch {}

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('فشل استعادة النسخة الاحتياطية');
    }
  }

  async listBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backups = await Promise.all(
        files
          .filter((f) => f.endsWith('.zip'))
          .map(async (f) => {
            const filePath = path.join(this.backupDir, f);
            const stats = await fs.stat(filePath);
            return {
              name: f,
              size: stats.size,
              created: stats.birthtime,
            };
          }),
      );

      return backups.sort((a, b) => b.created.getTime() - a.created.getTime());
    } catch (error) {
      this.logger.error('Failed to list backups', error);
      return [];
    }
  }

  async deleteBackup(backupName: string) {
    const backupPath = path.join(this.backupDir, backupName);

    try {
      await fs.unlink(backupPath);

      this.logger.log(`Backup deleted: ${backupName}`);

      await this.prisma.auditLog.create({
        data: {
          action: 'BACKUP_DELETED',
          entity: 'System',
          entityId: backupName,
          details: JSON.stringify({
            backupName,
            deletedAt: new Date().toISOString(),
          }),
        },
      });

      return {
        success: true,
        message: 'تم حذف النسخة الاحتياطية بنجاح',
      };
    } catch (error) {
      this.logger.error('Failed to delete backup', error);
      throw new NotFoundException('النسخة الاحتياطية غير موجودة');
    }
  }

  async getBackupPath(backupName: string): Promise<string> {
    return path.join(this.backupDir, backupName);
  }
}
