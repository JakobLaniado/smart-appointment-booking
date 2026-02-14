import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";
import { OverrideType } from "@prisma/client";

export class CreateOverrideDto {
  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @IsEnum(OverrideType)
  type!: OverrideType;

  @IsOptional()
  @IsString()
  reason?: string;
}
