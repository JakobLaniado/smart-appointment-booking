import { IsString, IsOptional, MinLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ChatDto {
  @ApiProperty({ description: "Chat message to the scheduling agent" })
  @IsString()
  @MinLength(1)
  message!: string;

  @ApiPropertyOptional({ description: "Target provider ID for context" })
  @IsOptional()
  @IsString()
  providerId?: string;
}
