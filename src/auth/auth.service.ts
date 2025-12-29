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
      message: 'تم التسجيل بنجاح. يرجى التحقق من حسابك باستخدام الرمز المرسل',
      userId: user.id,
      // في الإنتاج، لا نرسل الكود في الاستجابة
      otpCode: otpCode, // فقط للتطوير
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

  // تسجيل الدخول
  async login(loginDto: LoginDto) {
    const { email, phone, password } = loginDto;

    if (!email && !phone) {
      throw new BadRequestException(
        'يجب إدخال البريد الإلكتروني أو رقم الهاتف',
      );
    }

    // البحث عن المستخدم
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [email ? { email } : {}, phone ? { phone } : {}],
      },
    });

    if (!user) {
      throw new UnauthorizedException(
        'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      );
    }

    // التحقق من كلمة المرور
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException(
        'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      );
    }

    // التحقق من تفعيل الحساب
    if (!user.isVerified) {
      throw new UnauthorizedException('يجب تفعيل الحساب أولاً');
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

    // إنشاء JWT Token
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
}
