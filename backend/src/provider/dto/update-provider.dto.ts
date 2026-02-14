import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProviderDto {
  @ApiPropertyOptional({ description: 'Provider profession' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  profession?: string;

  @ApiPropertyOptional({
    description: 'Provider timezone',
    example: 'America/New_York',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Buffer minutes between appointments',
    minimum: 0,
    maximum: 120,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  bufferMinutes?: number;
}
