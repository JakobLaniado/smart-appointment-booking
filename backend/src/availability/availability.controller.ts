import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
} from "@nestjs/common";
import { AvailabilityService } from "./availability.service.js";
import { CreateRecurringDto } from "./dto/create-recurring.dto.js";
import { CreateOverrideDto } from "./dto/create-override.dto.js";
import { QuerySlotsDto } from "./dto/query-slots.dto.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { JwtPayload } from "../common/decorators/current-user.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";

@Controller("availability")
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Post("recurring")
  @Roles("PROVIDER")
  createRecurring(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRecurringDto,
  ) {
    return this.availabilityService.createRecurring(user.sub, dto);
  }

  @Get("recurring")
  @Roles("PROVIDER")
  listRecurring(@CurrentUser() user: JwtPayload) {
    return this.availabilityService.listRecurring(user.sub);
  }

  @Delete("recurring/:id")
  @Roles("PROVIDER")
  deleteRecurring(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
  ) {
    return this.availabilityService.deleteRecurring(user.sub, id);
  }

  @Post("overrides")
  @Roles("PROVIDER")
  createOverride(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOverrideDto,
  ) {
    return this.availabilityService.createOverride(user.sub, dto);
  }

  @Get("overrides")
  @Roles("PROVIDER")
  listOverrides(
    @CurrentUser() user: JwtPayload,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    return this.availabilityService.listOverrides(user.sub, dateFrom, dateTo);
  }

  @Delete("overrides/:id")
  @Roles("PROVIDER")
  deleteOverride(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
  ) {
    return this.availabilityService.deleteOverride(user.sub, id);
  }

  @Get("slots/:providerId")
  querySlots(
    @Param("providerId") providerId: string,
    @Query() dto: QuerySlotsDto,
  ) {
    return this.availabilityService.querySlots(providerId, dto);
  }
}
