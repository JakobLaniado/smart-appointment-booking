import { IsOptional, IsDateString, IsEnum } from "class-validator";
import { BookingStatus } from "@prisma/client";
import { PaginationDto } from "../../common/dto/pagination.dto.js";

export class ListBookingsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
