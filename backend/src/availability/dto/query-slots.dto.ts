import {
  IsDateString,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsString,
  IsArray,
  IsIn,
} from "class-validator";
import { Type } from "class-transformer";

export class QuerySlotsDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsInt()
  @Min(15)
  @Max(480)
  @Type(() => Number)
  durationMinutes!: number;

  @IsOptional()
  @IsIn(["morning", "afternoon", "evening"])
  timeOfDay?: "morning" | "afternoon" | "evening";

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  preferredDays?: number[];

  @IsOptional()
  @IsString()
  notBefore?: string;

  @IsOptional()
  @IsString()
  notAfter?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  maxResults?: number = 10;
}
