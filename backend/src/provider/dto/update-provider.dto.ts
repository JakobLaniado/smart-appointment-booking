import { IsOptional, IsString, IsInt, Min, Max, MinLength } from "class-validator";

export class UpdateProviderDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  profession?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  bufferMinutes?: number;
}
