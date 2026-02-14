import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OverrideType } from '@prisma/client';

export class CreateOverrideDto {
  @ApiProperty({ description: 'Override start time (ISO 8601)' })
  @IsDateString()
  startTime!: string;

  @ApiProperty({ description: 'Override end time (ISO 8601)' })
  @IsDateString()
  endTime!: string;

  @ApiProperty({ description: 'Override type', enum: OverrideType })
  @IsEnum(OverrideType)
  type!: OverrideType;

  @ApiPropertyOptional({ description: 'Reason for the override' })
  @IsOptional()
  @IsString()
  reason?: string;
}
