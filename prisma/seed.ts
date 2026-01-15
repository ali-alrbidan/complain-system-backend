// prisma/seed.ts

import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { hash } from 'bcrypt';
import 'dotenv/config';
import {
  ComplaintStatus,
  PrismaClient,
  UserRole,
} from '../generated/prisma/client';

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 开始填充数据...');

  // 清除现有数据
  await prisma.auditLog.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.complaintHistory.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.department.deleteMany();
  await prisma.user.deleteMany();

  console.log('🗑️ 已清除旧数据');

  // 哈希密码
  const hashedPassword = await hash('Password123!', 10);

  // 1. 创建政府部门
  const departments = await prisma.department.createMany({
    data: [
      {
        name: 'بلدية الرياض',
        description: 'بلدية منطقة الرياض، تختص بالخدمات البلدية والنظافة',
        isActive: true,
      },
      {
        name: 'وزارة الصحة',
        description: 'وزارة الصحة السعودية، تختص بالشكاوى الصحية والمستشفيات',
        isActive: true,
      },
      {
        name: 'وزارة التعليم',
        description: 'وزارة التعليم، تختص بالشكاوى التعليمية والمدارس',
        isActive: true,
      },
      {
        name: 'هيئة الاتصالات',
        description:
          'هيئة الاتصالات وتقنية المعلومات، تختص بشكاوى الاتصالات والإنترنت',
        isActive: true,
      },
      {
        name: 'المرور العام',
        description: 'الإدارة العامة للمرور، تختص بشكاوى المرور والازدحام',
        isActive: true,
      },
    ],
  });

  const departmentRecords = await prisma.department.findMany();
  console.log(`🏛️ 创建了 ${departmentRecords.length} 个政府部门`);

  // 2. 创建用户 (مواطنين، موظفين، مشرفين)
  const users = [
    // المواطنون
    {
      phone: '0512345678',
      email: 'citizen1@example.com',
      password: hashedPassword,
      name: 'أحمد محمد',
      role: UserRole.CITIZEN,
      isVerified: true,
      isActive: true,
    },
    {
      phone: '0598765432',
      email: 'citizen2@example.com',
      password: hashedPassword,
      name: 'فاطمة عبدالله',
      role: UserRole.CITIZEN,
      isVerified: true,
      isActive: true,
    },
    {
      phone: '0555555555',
      email: 'citizen3@example.com',
      password: hashedPassword,
      name: 'خالد سعيد',
      role: UserRole.CITIZEN,
      isVerified: true,
      isActive: true,
    },

    // الموظفون (جهات حكومية)
    {
      phone: '0566666666',
      email: 'employee1@example.com',
      password: hashedPassword,
      name: 'محمد الرشيد',
      role: UserRole.EMPLOYEE,
      isVerified: true,
      isActive: true,
      departmentId: departmentRecords[0].id, // بلدية الرياض
    },
    {
      phone: '0577777777',
      email: 'employee2@example.com',
      password: hashedPassword,
      name: 'سارة القحطاني',
      role: UserRole.EMPLOYEE,
      isVerified: true,
      isActive: true,
      departmentId: departmentRecords[1].id, // وزارة الصحة
    },
    {
      phone: '0588888888',
      email: 'employee3@example.com',
      password: hashedPassword,
      name: 'عبدالعزيز الفهد',
      role: UserRole.EMPLOYEE,
      isVerified: true,
      isActive: true,
      departmentId: departmentRecords[2].id, // وزارة التعليم
    },

    // المشرفون العامون
    {
      phone: '0599999999',
      email: 'admin@example.com',
      password: hashedPassword,
      name: 'المشرف العام',
      role: UserRole.ADMIN,
      isVerified: true,
      isActive: true,
    },
  ];

  for (const user of users) {
    await prisma.user.create({
      data: user,
    });
  }

  const userRecords = await prisma.user.findMany();
  console.log(`👥 创建了 ${userRecords.length} 个用户`);

  // 获取特定用户
  const citizen1 = userRecords.find((u) => u.email === 'citizen1@example.com')!;
  const citizen2 = userRecords.find((u) => u.email === 'citizen2@example.com')!;
  const employee1 = userRecords.find(
    (u) => u.email === 'employee1@example.com',
  )!;
  const employee2 = userRecords.find(
    (u) => u.email === 'employee2@example.com',
  )!;

  // 3. 创建 الشكاوى
  const complaints = [
    // شكاوى بلدية الرياض
    {
      referenceNumber: `CMP-${Date.now()}-001`,
      type: 'نظافة عامة',
      location: 'حي العليا، شارع الملك فهد',
      description: 'مخلفات بناء متراكمة أمام المبنى لأكثر من أسبوعين',
      status: ComplaintStatus.NEW,
      priority: 3,
      citizenId: citizen1.id,
      departmentId: departmentRecords[0].id,
    },
    {
      referenceNumber: `CMP-${Date.now()}-002`,
      type: 'إنارة شوارع',
      location: 'حي النخيل، شارع الأمير محمد',
      description: 'أعمدة إنارة معطلة في المنطقة',
      status: ComplaintStatus.IN_PROGRESS,
      priority: 2,
      citizenId: citizen2.id,
      departmentId: departmentRecords[0].id,
      assignedEmployeeId: employee1.id,
      isLocked: true,
      lockedAt: new Date(Date.now() - 86400000), // قبل يوم واحد
    },
    {
      referenceNumber: `CMP-${Date.now()}-003`,
      type: 'أرصفة مهدمة',
      location: 'حي الوشم، شارع العروبة',
      description: 'أرصفة متضررة تشكل خطراً على المشاة',
      status: ComplaintStatus.COMPLETED,
      priority: 4,
      citizenId: citizen1.id,
      departmentId: departmentRecords[0].id,
      resolvedAt: new Date(Date.now() - 172800000), // قبل يومين
    },

    // شكاوى وزارة الصحة
    {
      referenceNumber: `CMP-${Date.now()}-004`,
      type: 'مستشفى حكومي',
      location: 'مستشفى الملك فهد',
      description: 'أوقات انتظار طويلة في الطوارئ',
      status: ComplaintStatus.NEW,
      priority: 5,
      citizenId: citizen2.id,
      departmentId: departmentRecords[1].id,
    },
    {
      referenceNumber: `CMP-${Date.now()}-005`,
      type: 'مركز صحي',
      location: 'مركز صحي حي الروضة',
      description: 'نقص في الأدوية الأساسية',
      status: ComplaintStatus.REJECTED,
      priority: 1,
      citizenId: citizen1.id,
      departmentId: departmentRecords[1].id,
    },

    // شكاوى وزارة التعليم
    {
      referenceNumber: `CMP-${Date.now()}-006`,
      type: 'مدرسة حكومية',
      location: 'مدرسة الأمير فيصل',
      description: 'تسرب مياه في فصول المدرسة',
      status: ComplaintStatus.IN_PROGRESS,
      priority: 3,
      citizenId: citizen2.id,
      departmentId: departmentRecords[2].id,
    },
  ];

  for (const complaint of complaints) {
    await prisma.complaint.create({
      data: complaint,
    });
  }

  const complaintRecords = await prisma.complaint.findMany();
  console.log(`📋 创建了 ${complaintRecords.length} 个 شكوى`);

  // 获取特定 الشكاوى
  const complaint1 = complaintRecords[0]; // شكوى جديدة
  const complaint2 = complaintRecords[1]; // شكوى قيد المعالجة
  const complaint3 = complaintRecords[2]; // شكوى منجزة

  // 4. 创建 التعليقات
  const comments = [
    {
      content: 'تم استلام الشكوى وسيتم معالجتها خلال 48 ساعة',
      isInternal: false,
      complaintId: complaint1.id,
      authorId: employee1.id,
    },
    {
      content: 'يجب مراجعة فريق النظافة في المنطقة',
      isInternal: true,
      complaintId: complaint1.id,
      authorId: employee1.id,
    },
    {
      content: 'تم إصلاح الإنارة في الموقع',
      isInternal: false,
      complaintId: complaint2.id,
      authorId: employee1.id,
    },
    {
      content: 'شكراً لجهودكم في حل المشكلة',
      isInternal: false,
      complaintId: complaint3.id,
      authorId: citizen1.id,
    },
  ];

  for (const comment of comments) {
    await prisma.comment.create({
      data: comment,
    });
  }

  console.log(`💬 创建了 ${comments.length} 个 تعليق`);

  // 5. 创建 تاريخ التغييرات
  const histories = [
    {
      action: 'تغيير الحالة',
      oldValue: ComplaintStatus.NEW,
      newValue: ComplaintStatus.IN_PROGRESS,
      description: 'بدء معالجة الشكوى',
      complaintId: complaint2.id,
      performedBy: employee1.id,
    },
    {
      action: 'تغيير الحالة',
      oldValue: ComplaintStatus.IN_PROGRESS,
      newValue: ComplaintStatus.COMPLETED,
      description: 'تم حل المشكلة',
      complaintId: complaint3.id,
      performedBy: employee1.id,
    },
  ];

  for (const history of histories) {
    await prisma.complaintHistory.create({
      data: history,
    });
  }

  console.log(`📜 创建了 ${histories.length} 个 تغيير في التاريخ`);

  // 6. 创建 الإشعارات
  const notifications = [
    {
      title: 'شكوى جديدة',
      message: 'تم تقديم شكوى جديدة في منطقتك',
      type: 'new_complaint',
      userId: employee1.id,
      complaintId: complaint1.id,
    },
    {
      title: 'تحديث حالة الشكوى',
      message: 'تم تغيير حالة شكواك إلى "قيد المعالجة"',
      type: 'status_update',
      userId: citizen2.id,
      complaintId: complaint2.id,
    },
    {
      title: 'تم حل الشكوى',
      message: 'تم حل شكواك بنجاح',
      type: 'complaint_resolved',
      userId: citizen1.id,
      complaintId: complaint3.id,
    },
  ];

  for (const notification of notifications) {
    await prisma.notification.create({
      data: notification,
    });
  }

  console.log(`🔔 创建了 ${notifications.length} 个 إشعار`);

  // 7. 创建 سجل التدقيق
  const auditLogs = [
    {
      action: 'login',
      entity: 'User',
      entityId: citizen1.id,
      details: JSON.stringify({ ip: '192.168.1.1' }),
      ipAddress: '192.168.1.1',
      userId: citizen1.id,
    },
    {
      action: 'create_complaint',
      entity: 'Complaint',
      entityId: complaint1.id,
      details: JSON.stringify({ type: 'نظافة عامة' }),
      userId: citizen1.id,
    },
  ];

  for (const log of auditLogs) {
    await prisma.auditLog.create({
      data: log,
    });
  }

  console.log(`📊 创建了 ${auditLogs.length} 个 سجل تدقيق`);

  console.log('✅ 数据填充完成!');
  console.log('\n📊 统计数据:');
  console.log(`- 政府部门: ${departmentRecords.length}`);
  console.log(`- 用户: ${userRecords.length}`);
  console.log(`- 投诉: ${complaintRecords.length}`);
  console.log(`- 评论: ${comments.length}`);
  console.log(`- 通知: ${notifications.length}`);

  console.log('\n🔑 测试账户:');
  console.log('مواطن: citizen1@example.com / Password123!');
  console.log('موظف: employee1@example.com / Password123!');
  console.log('مشرف: admin@example.com / Password123!');
}

main()
  .catch((e) => {
    console.error('❌ 填充数据时出错:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
