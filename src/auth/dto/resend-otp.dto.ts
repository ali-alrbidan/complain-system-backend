import { IsString } from 'class-validator';

// src/auth/dto/resend-otp.dto.ts
export class ResendOtpDto {
  @IsString()
  userId: string;

  @IsString()
  purpose: string;
}
