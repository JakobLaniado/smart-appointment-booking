import {
  IsDateString,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsString,
  IsArray,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class QuerySlotsDto {
  @ApiProperty({ description: 'Start date for slot query (ISO 8601)' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ description: 'End date for slot query (ISO 8601)' })
  @IsDateString()
  endDate!: string;

  @ApiProperty({
    description: 'Appointment duration in minutes',
    minimum: 15,
    maximum: 480,
  })
  @IsInt()
  @Min(15)
  @Max(480)
  @Type(() => Number)
  durationMinutes!: number;

  @ApiPropertyOptional({
    description: 'Preferred time of day',
    enum: ['morning', 'afternoon', 'evening'],
  })
  @IsOptional()
  @IsIn(['morning', 'afternoon', 'evening'])
  timeOfDay?: 'morning' | 'afternoon' | 'evening';

  @ApiPropertyOptional({
    description: 'Preferred days of week (0=Sunday, 6=Saturday)',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  preferredDays?: number[];

  @ApiPropertyOptional({ description: 'Earliest time filter (HH:mm)' })
  @IsOptional()
  @IsString()
  notBefore?: string;

  @ApiPropertyOptional({ description: 'Latest time filter (HH:mm)' })
  @IsOptional()
  @IsString()
  notAfter?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of results',
    default: 10,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  maxResults?: number = 10;
}
