import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole } from 'generated/prisma/enums';

// DTOs
export class CreateUserDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  name: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsString()
  @IsOptional()
  departmentId?: string;
}
