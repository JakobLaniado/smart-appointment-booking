import { IsInt, Min, Max, Matches } from "class-validator";

export class CreateRecurringDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @Matches(/^\d{2}:\d{2}$/, { message: "startTime must be in HH:mm format" })
  startTime!: string;

  @Matches(/^\d{2}:\d{2}$/, { message: "endTime must be in HH:mm format" })
  endTime!: string;
}
