import { Module } from '@nestjs/common';
import { AvailabilityController } from './availability.controller.js';
import { AvailabilityService } from './availability.service.js';
import { AvailabilityCalculatorService } from './availability-calculator.service.js';

@Module({
  controllers: [AvailabilityController],
  providers: [AvailabilityService, AvailabilityCalculatorService],
  exports: [AvailabilityService, AvailabilityCalculatorService],
})
export class AvailabilityModule {}
