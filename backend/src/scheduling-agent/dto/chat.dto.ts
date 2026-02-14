import { IsString, IsOptional, MinLength } from "class-validator";

export class ChatDto {
  @IsString()
  @MinLength(1)
  message!: string;

  @IsOptional()
  @IsString()
  providerId?: string;
}
