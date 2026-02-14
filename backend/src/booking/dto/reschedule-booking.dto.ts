import { IsDateString, IsInt, Min, Max } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RescheduleBookingDto {
  @ApiProperty({ description: "New start time (ISO 8601)" })
  @IsDateString()
  newStartTime!: string;

  @ApiProperty({ description: "Appointment duration in minutes", minimum: 15, maximum: 480 })
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes!: number;
}
