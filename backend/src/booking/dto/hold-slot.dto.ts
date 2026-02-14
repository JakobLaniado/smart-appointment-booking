import { IsString, IsDateString, IsInt, Min, Max, IsOptional } from "class-validator";

export class HoldSlotDto {
  @IsString()
  providerId!: string;

  @IsDateString()
  startTime!: string;

  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
