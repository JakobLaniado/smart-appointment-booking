import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
} from "@nestjs/common";
import { BookingService } from "./booking.service.js";
import { HoldSlotDto } from "./dto/hold-slot.dto.js";
import { ConfirmBookingDto } from "./dto/confirm-booking.dto.js";
import { CancelBookingDto } from "./dto/cancel-booking.dto.js";
import { RescheduleBookingDto } from "./dto/reschedule-booking.dto.js";
import { ListBookingsDto } from "./dto/list-bookings.dto.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { JwtPayload } from "../common/decorators/current-user.decorator.js";
import { IdempotencyKey } from "../common/decorators/idempotency-key.decorator.js";

@Controller("bookings")
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post("hold")
  holdSlot(@CurrentUser() user: JwtPayload, @Body() dto: HoldSlotDto) {
    return this.bookingService.holdSlot(user.sub, dto);
  }

  @Post("confirm")
  confirmBooking(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConfirmBookingDto,
    @IdempotencyKey() key: string,
  ) {
    return this.bookingService.confirmBooking(user.sub, dto, key);
  }

  @Get()
  listBookings(
    @CurrentUser() user: JwtPayload,
    @Query() dto: ListBookingsDto,
  ) {
    return this.bookingService.listBookings(user.sub, user.role, dto);
  }

  @Get(":id")
  getBooking(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.bookingService.getBooking(user.sub, id);
  }

  @Patch(":id/cancel")
  cancelBooking(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: CancelBookingDto,
    @IdempotencyKey() key: string,
  ) {
    return this.bookingService.cancelBooking(user.sub, id, dto, key);
  }

  @Patch(":id/reschedule")
  rescheduleBooking(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: RescheduleBookingDto,
    @IdempotencyKey() key: string,
  ) {
    return this.bookingService.rescheduleBooking(user.sub, id, dto, key);
  }
}
