import { IsString } from "class-validator";

export class ConfirmBookingDto {
  @IsString()
  holdId!: string;
}
