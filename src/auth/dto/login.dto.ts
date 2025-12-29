import { IsEmail, IsOptional, IsString } from 'class-validator';

// src/auth/dto/login.dto.ts
export class LoginDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  password: string;
}
