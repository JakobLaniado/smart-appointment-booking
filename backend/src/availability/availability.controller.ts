import {
  Controller,
  Get,
  Post,
  Delete,
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
  ApiQuery,
} from '@nestjs/swagger';
import { AvailabilityService } from './availability.service.js';
import { CreateRecurringDto } from './dto/create-recurring.dto.js';
import { CreateOverrideDto } from './dto/create-override.dto.js';
import { QuerySlotsDto } from './dto/query-slots.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';

@ApiTags('Availability')
@ApiBearerAuth()
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Post('recurring')
  @Roles('PROVIDER')
  @ApiOperation({ summary: 'Create a recurring availability rule' })
  @ApiResponse({ status: 201, description: 'Recurring rule created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  createRecurring(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRecurringDto,
  ) {
    return this.availabilityService.createRecurring(user.sub, dto);
  }

  @Get('recurring')
  @Roles('PROVIDER')
  @ApiOperation({ summary: 'List recurring availability rules' })
  @ApiResponse({ status: 200, description: 'List of recurring rules' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  listRecurring(@CurrentUser() user: JwtPayload) {
    return this.availabilityService.listRecurring(user.sub);
  }

  @Delete('recurring/:id')
  @Roles('PROVIDER')
  @ApiOperation({ summary: 'Delete a recurring availability rule' })
  @ApiParam({ name: 'id', description: 'Recurring rule ID' })
  @ApiResponse({ status: 200, description: 'Recurring rule deleted' })
  @ApiResponse({ status: 404, description: 'Rule not found' })
  deleteRecurring(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.availabilityService.deleteRecurring(user.sub, id);
  }

  @Post('overrides')
  @Roles('PROVIDER')
  @ApiOperation({ summary: 'Create an availability override' })
  @ApiResponse({ status: 201, description: 'Override created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  createOverride(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOverrideDto,
  ) {
    return this.availabilityService.createOverride(user.sub, dto);
  }

  @Get('overrides')
  @Roles('PROVIDER')
  @ApiOperation({ summary: 'List availability overrides' })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Filter from date',
  })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Filter to date' })
  @ApiResponse({ status: 200, description: 'List of overrides' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  listOverrides(
    @CurrentUser() user: JwtPayload,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.availabilityService.listOverrides(user.sub, dateFrom, dateTo);
  }

  @Delete('overrides/:id')
  @Roles('PROVIDER')
  @ApiOperation({ summary: 'Delete an availability override' })
  @ApiParam({ name: 'id', description: 'Override ID' })
  @ApiResponse({ status: 200, description: 'Override deleted' })
  @ApiResponse({ status: 404, description: 'Override not found' })
  deleteOverride(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.availabilityService.deleteOverride(user.sub, id);
  }

  @Get('slots/:providerId')
  @ApiOperation({ summary: 'Query available time slots for a provider' })
  @ApiParam({ name: 'providerId', description: 'Provider ID' })
  @ApiResponse({ status: 200, description: 'Available slots' })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  querySlots(
    @Param('providerId') providerId: string,
    @Query() dto: QuerySlotsDto,
  ) {
    return this.availabilityService.querySlots(providerId, dto);
  }
}
