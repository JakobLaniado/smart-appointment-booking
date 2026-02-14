import {
  IsString,
  IsDateString,
  IsInt,
  Min,
  Max,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HoldSlotDto {
  @ApiProperty({ description: 'Provider ID to book with' })
  @IsString()
  providerId!: string;

  @ApiProperty({ description: 'Desired start time (ISO 8601)' })
  @IsDateString()
  startTime!: string;

  @ApiProperty({
    description: 'Appointment duration in minutes',
    minimum: 15,
    maximum: 480,
  })
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes!: number;

  @ApiPropertyOptional({ description: 'Optional notes for the appointment' })
  @IsOptional()
  @IsString()
  notes?: string;
}
