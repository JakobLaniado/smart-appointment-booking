import { Module } from "@nestjs/common";
import { AvailabilityModule } from "../availability/availability.module.js";
import { BookingModule } from "../booking/booking.module.js";
import { ProviderModule } from "../provider/provider.module.js";
import { SchedulingAgentController } from "./scheduling-agent.controller.js";
import { SchedulingAgentService } from "./scheduling-agent.service.js";
import { ToolExecutor } from "./tools/tool-executor.js";

@Module({
  imports: [AvailabilityModule, BookingModule, ProviderModule],
  controllers: [SchedulingAgentController],
  providers: [SchedulingAgentService, ToolExecutor],
})
export class SchedulingAgentModule {}
