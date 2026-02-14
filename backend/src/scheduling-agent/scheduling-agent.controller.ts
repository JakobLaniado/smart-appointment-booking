import { Body, Controller, Post } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { JwtPayload } from "../common/decorators/current-user.decorator.js";
import { SchedulingAgentService } from "./scheduling-agent.service.js";
import { ChatDto } from "./dto/chat.dto.js";

@Controller("agent")
export class SchedulingAgentController {
  constructor(private readonly agentService: SchedulingAgentService) {}

  @Post("chat")
  async chat(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChatDto,
  ) {
    const response = await this.agentService.chat({
      message: dto.message,
      userId: user.sub,
      role: user.role as "CUSTOMER" | "PROVIDER",
      providerId: dto.providerId,
    });

    return { response };
  }
}
