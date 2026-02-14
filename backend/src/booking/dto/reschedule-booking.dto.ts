import { IsDateString, IsInt, Min, Max } from "class-validator";

export class RescheduleBookingDto {
  @IsDateString()
  newStartTime!: string;

  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes!: number;
}
