import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { JwtPayload } from "../common/decorators/current-user.decorator.js";
import { SchedulingAgentService } from "./scheduling-agent.service.js";
import { ChatDto } from "./dto/chat.dto.js";

@ApiTags("Scheduling Agent")
@ApiBearerAuth()
@Controller("agent")
export class SchedulingAgentController {
  constructor(private readonly agentService: SchedulingAgentService) {}

  @Post("chat")
  @ApiOperation({ summary: "Send a message to the scheduling agent" })
  @ApiResponse({ status: 201, description: "Agent response" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
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
