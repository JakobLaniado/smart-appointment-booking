import {
  IsEmail,
  IsString,
  MinLength,
  IsEnum,
  IsOptional,
  ValidateIf,
} from "class-validator";
import { UserRole } from "@prisma/client";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @ValidateIf((o: RegisterDto) => o.role === UserRole.PROVIDER)
  @IsString()
  @MinLength(1)
  profession?: string;

  @ValidateIf((o: RegisterDto) => o.role === UserRole.PROVIDER)
  @IsString()
  @MinLength(1)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  bufferMinutes?: number;
}
