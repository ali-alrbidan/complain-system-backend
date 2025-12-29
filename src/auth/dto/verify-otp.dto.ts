import { IsString } from 'class-validator';

// src/auth/dto/verify-otp.dto.ts
export class VerifyOtpDto {
  @IsString()
  userId: string;

  @IsString()
  code: string;

  @IsString()
  purpose: string; // 'registration' | 'login' | 'password_reset'
}
