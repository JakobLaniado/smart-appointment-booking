import { IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ConfirmBookingDto {
  @ApiProperty({ description: "Hold ID to confirm" })
  @IsString()
  holdId!: string;
}
