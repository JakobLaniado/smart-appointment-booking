import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { BookingService } from './booking.service.js';
import { HoldSlotDto } from './dto/hold-slot.dto.js';
import { ConfirmBookingDto } from './dto/confirm-booking.dto.js';
import { CancelBookingDto } from './dto/cancel-booking.dto.js';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto.js';
import { ListBookingsDto } from './dto/list-bookings.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/decorators/current-user.decorator.js';
import { IdempotencyKey } from '../common/decorators/idempotency-key.decorator.js';

@ApiTags('Bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post('hold')
  @ApiOperation({ summary: 'Hold a time slot temporarily' })
  @ApiResponse({ status: 201, description: 'Slot held successfully' })
  @ApiResponse({ status: 409, description: 'Slot already taken' })
  holdSlot(@CurrentUser() user: JwtPayload, @Body() dto: HoldSlotDto) {
    return this.bookingService.holdSlot(user.sub, dto);
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Confirm a held booking' })
  @ApiResponse({ status: 201, description: 'Booking confirmed' })
  @ApiResponse({ status: 404, description: 'Hold not found or expired' })
  confirmBooking(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConfirmBookingDto,
    @IdempotencyKey() key: string,
  ) {
    return this.bookingService.confirmBooking(user.sub, dto, key);
  }

  @Get()
  @ApiOperation({ summary: 'List bookings with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Paginated list of bookings' })
  listBookings(@CurrentUser() user: JwtPayload, @Query() dto: ListBookingsDto) {
    return this.bookingService.listBookings(user.sub, user.role, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get booking by ID' })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking details' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  getBooking(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.bookingService.getBooking(user.sub, id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a booking' })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking cancelled' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  cancelBooking(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
    @IdempotencyKey() key: string,
  ) {
    return this.bookingService.cancelBooking(user.sub, id, dto, key);
  }

  @Patch(':id/reschedule')
  @ApiOperation({ summary: 'Reschedule a booking' })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking rescheduled' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 409, description: 'New slot not available' })
  rescheduleBooking(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RescheduleBookingDto,
    @IdempotencyKey() key: string,
  ) {
    return this.bookingService.rescheduleBooking(user.sub, id, dto, key);
  }
}
