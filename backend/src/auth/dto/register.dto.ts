import {
  IsEmail,
  IsString,
  MinLength,
  IsEnum,
  IsOptional,
  ValidateIf,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";

export class RegisterDto {
  @ApiProperty({ description: "User email address", example: "user@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: "Password (min 6 characters)", minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ description: "Full name of the user" })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ description: "User role", enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiPropertyOptional({ description: "Profession (required for providers)" })
  @ValidateIf((o: RegisterDto) => o.role === UserRole.PROVIDER)
  @IsString()
  @MinLength(1)
  profession?: string;

  @ApiPropertyOptional({ description: "Timezone (required for providers)", example: "America/New_York" })
  @ValidateIf((o: RegisterDto) => o.role === UserRole.PROVIDER)
  @IsString()
  @MinLength(1)
  timezone?: string;

  @ApiPropertyOptional({ description: "Buffer minutes between appointments" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  bufferMinutes?: number;
}
