import { IsInt, Min, Max, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateRecurringDto {
  @ApiProperty({ description: "Day of week (0=Sunday, 6=Saturday)", minimum: 0, maximum: 6 })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ description: "Start time in HH:mm format", example: "09:00" })
  @Matches(/^\d{2}:\d{2}$/, { message: "startTime must be in HH:mm format" })
  startTime!: string;

  @ApiProperty({ description: "End time in HH:mm format", example: "17:00" })
  @Matches(/^\d{2}:\d{2}$/, { message: "endTime must be in HH:mm format" })
  endTime!: string;
}
