// // src/auth/auth.service.ts
// import {
//   Injectable,
//   BadRequestException,
//   UnauthorizedException,
//   ConflictException,
//   ForbiddenException,
// } from '@nestjs/common';
// import { JwtService } from '@nestjs/jwt';
// import { PrismaService } from '../prisma/prisma.service';
// import * as bcrypt from 'bcrypt';

// import { UserRole } from '../../generated/prisma/enums';
// import { RegisterDto } from './dto/register.dto';
// import { VerifyOtpDto } from './dto/verify-otp.dto';
// import { LoginDto } from './dto/login.dto';

// @Injectable()
// export class AuthService {
//   constructor(
//     private prisma: PrismaService,
//     private jwtService: JwtService,
//   ) {}

//   // توليد رمز OTP عشوائي
//   private generateOtpCode(): string {
//     return Math.floor(100000 + Math.random() * 900000).toString();
//   }

//   // تسجيل مستخدم جديد
//   async register(registerDto: RegisterDto) {
//     const { email, phone, password, name, role } = registerDto;

//     // التحقق من وجود البريد الإلكتروني أو رقم الهاتف
//     if (!email && !phone) {
//       throw new BadRequestException(
//         'يجب إدخال البريد الإلكتروني أو رقم الهاتف',
//       );
//     }

//     if (role === UserRole.ADMIN) {
//       const existingAdmin = await this.prisma.user.findFirst({
//         where: {
//           role: 'ADMIN',
//         },
//       });
//       if (existingAdmin) {
//         throw new ForbiddenException('لا يمكنك انشاء حساب admin ');
//       }
//     }

//     // التحقق من عدم وجود المستخدم مسبقاً
//     const existingUser = await this.prisma.user.findFirst({
//       where: {
//         OR: [email ? { email } : {}, phone ? { phone } : {}],
//       },
//     });

//     if (existingUser) {
//       throw new ConflictException('المستخدم موجود مسبقاً');
//     }

//     // تشفير كلمة المرور
//     const hashedPassword = await bcrypt.hash(password, 10);

//     // إنشاء المستخدم
//     const user = await this.prisma.user.create({
//       data: {
//         email,
//         phone,
//         password: hashedPassword,
//         name,
//         role: role || UserRole.CITIZEN,
//         isVerified: false,
//       },
//     });

//     // إنشاء رمز OTP
//     const otpCode = this.generateOtpCode();
//     const expiresAt = new Date();
//     expiresAt.setMinutes(expiresAt.getMinutes() + 10); // صالح لمدة 10 دقائق

//     await this.prisma.otpCode.create({
//       data: {
//         code: otpCode,
//         expiresAt,
//         purpose: 'registration',
//         userId: user.id,
//       },
//     });

//     // هنا يمكن إرسال الكود عبر SMS أو Email
//     console.log(`رمز التحقق للمستخدم ${user.id}: ${otpCode}`);

//     return {
//       purpose: 'registration',
//       message: 'تم التسجيل بنجاح. يرجى التحقق من حسابك باستخدام الرمز المرسل',
//       userId: user.id,
//       otpCode: otpCode,
//     };
//   }

//   // التحقق من رمز OTP
//   async verifyOtp(verifyOtpDto: VerifyOtpDto) {
//     const { userId, code, purpose } = verifyOtpDto;

//     const otpRecord = await this.prisma.otpCode.findFirst({
//       where: {
//         userId,
//         code,
//         purpose,
//         isUsed: false,
//         expiresAt: {
//           gte: new Date(),
//         },
//       },
//     });

//     if (!otpRecord) {
//       throw new BadRequestException('رمز التحقق غير صحيح أو منتهي الصلاحية');
//     }

//     // تحديث حالة OTP
//     await this.prisma.otpCode.update({
//       where: { id: otpRecord.id },
//       data: { isUsed: true },
//     });

//     // تفعيل حساب المستخدم
//     const user = await this.prisma.user.update({
//       where: { id: userId },
//       data: { isVerified: true },
//     });

//     // إنشاء سجل تدقيق
//     await this.prisma.auditLog.create({
//       data: {
//         action: 'VERIFY_ACCOUNT',
//         entity: 'User',
//         entityId: user.id,
//         userId: user.id,
//         details: JSON.stringify({ purpose }),
//       },
//     });

//     // إنشاء JWT Token
//     const token = await this.generateToken(user);

//     return {
//       message: 'تم تفعيل الحساب بنجاح',
//       user: {
//         id: user.id,
//         email: user.email,
//         phone: user.phone,
//         name: user.name,
//         role: user.role,
//       },
//       token,
//     };
//   }

//   // تسجيل الدخول
//   async login(loginDto: LoginDto) {
//     const { email, phone, password } = loginDto;

//     if (!email && !phone) {
//       throw new BadRequestException(
//         'يجب إدخال البريد الإلكتروني أو رقم الهاتف',
//       );
//     }

//     // البحث عن المستخدم
//     const user = await this.prisma.user.findFirst({
//       where: {
//         OR: [email ? { email } : {}, phone ? { phone } : {}],
//       },
//     });

//     if (!user) {
//       throw new UnauthorizedException(
//         'البريد الإلكتروني أو كلمة المرور غير صحيحة',
//       );
//     }

//     // التحقق من كلمة المرور
//     const isPasswordValid = await bcrypt.compare(password, user.password);

//     if (!isPasswordValid) {
//       throw new UnauthorizedException(
//         'البريد الإلكتروني أو كلمة المرور غير صحيحة',
//       );
//     }

//     // التحقق من تفعيل الحساب
//     if (!user.isVerified) {
//       return {
//         message: 'يجب تفعيل الحساب أولاً',
//         data: { email: user.email, userId: user.id, purpose: 'registration' },
//       };
//     }

//     // التحقق من أن الحساب نشط
//     if (!user.isActive) {
//       throw new UnauthorizedException('الحساب غير نشط');
//     }

//     // إنشاء سجل تدقيق
//     await this.prisma.auditLog.create({
//       data: {
//         action: 'LOGIN',
//         entity: 'User',
//         entityId: user.id,
//         userId: user.id,
//       },
//     });

//     // إنشاء JWT Token
//     const token = await this.generateToken(user);

//     return {
//       message: 'تم تسجيل الدخول بنجاح',
//       user: {
//         id: user.id,
//         email: user.email,
//         phone: user.phone,
//         name: user.name,
//         role: user.role,
//       },
//       token,
//     };
//   }

//   // إعادة إرسال رمز OTP
//   async resendOtp(userId: string, purpose: string) {
//     const user = await this.prisma.user.findUnique({
//       where: { id: userId },
//     });

//     if (!user) {
//       throw new BadRequestException('المستخدم غير موجود');
//     }

//     // حذف الرموز القديمة
//     await this.prisma.otpCode.deleteMany({
//       where: {
//         userId,
//         purpose,
//       },
//     });

//     // إنشاء رمز جديد
//     const otpCode = this.generateOtpCode();
//     const expiresAt = new Date();
//     expiresAt.setMinutes(expiresAt.getMinutes() + 10);

//     await this.prisma.otpCode.create({
//       data: {
//         code: otpCode,
//         expiresAt,
//         purpose,
//         userId,
//       },
//     });

//     // إرسال الكود
//     console.log(`رمز التحقق الجديد للمستخدم ${userId}: ${otpCode}`);

//     return {
//       message: 'تم إرسال رمز التحقق بنجاح',
//     };
//   }

//   // توليد JWT Token
//   private async generateToken(user: any) {
//     const payload = {
//       sub: user.id,
//       email: user.email,
//       phone: user.phone,
//       role: user.role,
//     };

//     return {
//       access_token: this.jwtService.sign(payload),
//     };
//   }

//   // جلب معلومات المستخدم الحالي (Auth/Me)
//   async getCurrentUser(userId: string) {
//     const user = await this.prisma.user.findUnique({
//       where: { id: userId },
//       select: {
//         id: true,
//         email: true,
//         phone: true,
//         name: true,
//         role: true,
//         isVerified: true,
//         isActive: true,
//         createdAt: true,
//         updatedAt: true,
//         department: {
//           select: {
//             id: true,
//             name: true,
//             description: true,
//             isActive: true,
//           },
//         },
//       },
//     });

//     if (!user) {
//       throw new UnauthorizedException('المستخدم غير موجود');
//     }

//     if (!user.isActive) {
//       throw new UnauthorizedException('الحساب غير نشط');
//     }

//     return user;
//   }

//   // التحقق من صلاحية التوكن (Auth/Check)
//   async checkToken(userId: string) {
//     const user = await this.prisma.user.findUnique({
//       where: { id: userId },
//       select: {
//         id: true,
//         isActive: true,
//         isVerified: true,
//         role: true,
//       },
//     });

//     if (!user) {
//       return {
//         valid: false,
//         message: 'المستخدم غير موجود',
//       };
//     }

//     if (!user.isActive) {
//       return {
//         valid: false,
//         message: 'الحساب غير نشط',
//       };
//     }

//     if (!user.isVerified) {
//       return {
//         valid: false,
//         message: 'الحساب غير مفعل',
//       };
//     }

//     return {
//       valid: true,
//       message: 'التوكن صالح',
//       user: {
//         id: user.id,
//         role: user.role,
//       },
//     };
//   }
// }
// src/auth/auth.service.ts
import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

import { UserRole } from '../../generated/prisma/enums';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private loginAttempts: Map<string, { count: number; lockUntil?: Date }> =
    new Map();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // توليد رمز OTP عشوائي
  private generateOtpCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // تسجيل مستخدم جديد
  async register(registerDto: RegisterDto) {
    const { email, phone, password, name, role } = registerDto;

    // التحقق من وجود البريد الإلكتروني أو رقم الهاتف
    if (!email && !phone) {
      throw new BadRequestException(
        'يجب إدخال البريد الإلكتروني أو رقم الهاتف',
      );
    }

    if (role === UserRole.ADMIN) {
      const existingAdmin = await this.prisma.user.findFirst({
        where: {
          role: 'ADMIN',
        },
      });
      if (existingAdmin) {
        throw new ForbiddenException('لا يمكنك انشاء حساب admin ');
      }
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

    // تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 10);

    // إنشاء المستخدم
    const user = await this.prisma.user.create({
      data: {
        email,
        phone,
        password: hashedPassword,
        name,
        role: role || UserRole.CITIZEN,
        isVerified: false,
      },
    });

    // إنشاء رمز OTP
    const otpCode = this.generateOtpCode();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // صالح لمدة 10 دقائق

    await this.prisma.otpCode.create({
      data: {
        code: otpCode,
        expiresAt,
        purpose: 'registration',
        userId: user.id,
      },
    });

    // هنا يمكن إرسال الكود عبر SMS أو Email
    console.log(`رمز التحقق للمستخدم ${user.id}: ${otpCode}`);

    return {
      purpose: 'registration',
      message: 'تم التسجيل بنجاح. يرجى التحقق من حسابك باستخدام الرمز المرسل',
      userId: user.id,
      otpCode: otpCode,
    };
  }

  // التحقق من رمز OTP
  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { userId, code, purpose } = verifyOtpDto;

    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        userId,
        code,
        purpose,
        isUsed: false,
        expiresAt: {
          gte: new Date(),
        },
      },
    });

    if (!otpRecord) {
      throw new BadRequestException('رمز التحقق غير صحيح أو منتهي الصلاحية');
    }

    // تحديث حالة OTP
    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });

    // تفعيل حساب المستخدم
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isVerified: true },
    });

    // إنشاء سجل تدقيق
    await this.prisma.auditLog.create({
      data: {
        action: 'VERIFY_ACCOUNT',
        entity: 'User',
        entityId: user.id,
        userId: user.id,
        details: JSON.stringify({ purpose }),
      },
    });

    // إنشاء JWT Token
    const token = await this.generateToken(user);

    return {
      message: 'تم تفعيل الحساب بنجاح',
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role,
      },
      token,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, phone, password } = loginDto;
    const identifier = email || phone;

    // التحقق من قفل الحساب
    const attempts = this.loginAttempts.get(identifier!);
    if (attempts?.lockUntil && attempts.lockUntil > new Date()) {
      throw new UnauthorizedException(
        `الحساب مقفل حتى ${attempts.lockUntil.toLocaleTimeString('ar-SA')}`,
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    });

    if (!user) {
      this.recordFailedAttempt(identifier!);
      throw new UnauthorizedException('البريد أو كلمة المرور غير صحيحة');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      this.recordFailedAttempt(identifier!);

      const currentAttempts = this.loginAttempts.get(identifier!)?.count || 0;
      const remainingAttempts = 5 - currentAttempts;

      if (remainingAttempts > 0) {
        throw new UnauthorizedException(
          `كلمة المرور غير صحيحة. المحاولات المتبقية: ${remainingAttempts}`,
        );
      } else {
        throw new UnauthorizedException(
          'تم قفل الحساب لمدة 15 دقيقة بسبب المحاولات الفاشلة',
        );
      }
    }

    // نجاح الدخول - إعادة تعيين المحاولات
    this.loginAttempts.delete(identifier!);

    // إشعار بنجاح الدخول
    await this.prisma.notification.create({
      data: {
        title: 'تسجيل دخول جديد',
        message: `تم تسجيل الدخول من جهاز جديد`,
        type: 'LOGIN_ALERT',
        userId: user.id,
      },
    });

    // التحقق من تفعيل الحساب
    if (!user.isVerified) {
      return {
        message: 'يجب تفعيل الحساب أولاً',
        data: { email: user.email, userId: user.id, purpose: 'registration' },
      };
    }

    // التحقق من أن الحساب نشط
    if (!user.isActive) {
      throw new UnauthorizedException('الحساب غير نشط');
    }

    // إنشاء سجل تدقيق
    await this.prisma.auditLog.create({
      data: {
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        userId: user.id,
      },
    });
    const token = await this.generateToken(user);
    return {
      message: 'تم تسجيل الدخول بنجاح',
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role,
      },
      token,
    };
  }

  // إعادة إرسال رمز OTP
  async resendOtp(userId: string, purpose: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('المستخدم غير موجود');
    }

    // حذف الرموز القديمة
    await this.prisma.otpCode.deleteMany({
      where: {
        userId,
        purpose,
      },
    });

    // إنشاء رمز جديد
    const otpCode = this.generateOtpCode();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await this.prisma.otpCode.create({
      data: {
        code: otpCode,
        expiresAt,
        purpose,
        userId,
      },
    });

    // إرسال الكود
    console.log(`رمز التحقق الجديد للمستخدم ${userId}: ${otpCode}`);

    return {
      message: 'تم إرسال رمز التحقق بنجاح',
    };
  }

  // توليد JWT Token
  private async generateToken(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  // جلب معلومات المستخدم الحالي (Auth/Me)
  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        role: true,
        isVerified: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        department: {
          select: {
            id: true,
            name: true,
            description: true,
            isActive: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('المستخدم غير موجود');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('الحساب غير نشط');
    }

    return user;
  }

  // التحقق من صلاحية التوكن (Auth/Check)
  async checkToken(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isActive: true,
        isVerified: true,
        role: true,
      },
    });

    if (!user) {
      return {
        valid: false,
        message: 'المستخدم غير موجود',
      };
    }

    if (!user.isActive) {
      return {
        valid: false,
        message: 'الحساب غير نشط',
      };
    }

    if (!user.isVerified) {
      return {
        valid: false,
        message: 'الحساب غير مفعل',
      };
    }

    return {
      valid: true,
      message: 'التوكن صالح',
      user: {
        id: user.id,
        role: user.role,
      },
    };
  }

  private recordFailedAttempt(identifier: string) {
    const current = this.loginAttempts.get(identifier) || { count: 0 };
    current.count += 1;

    // قفل الحساب بعد 5 محاولات فاشلة لمدة 15 دقيقة
    if (current.count >= 5) {
      current.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    }

    this.loginAttempts.set(identifier, current);

    // تنظيف البيانات القديمة بعد ساعة
    setTimeout(
      () => {
        this.loginAttempts.delete(identifier);
      },
      60 * 60 * 1000,
    );
  }
}
