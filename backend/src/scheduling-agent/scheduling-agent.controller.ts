import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/decorators/current-user.decorator.js';
import { SchedulingAgentService } from './scheduling-agent.service.js';
import { ChatDto } from './dto/chat.dto.js';

@ApiTags('Scheduling Agent')
@ApiBearerAuth()
@Controller('agent')
export class SchedulingAgentController {
  constructor(private readonly agentService: SchedulingAgentService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Send a message to the scheduling agent' })
  @ApiResponse({ status: 201, description: 'Agent response' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async chat(@CurrentUser() user: JwtPayload, @Body() dto: ChatDto) {
    const response = await this.agentService.chat({
      message: dto.message,
      userId: user.sub,
      role: user.role,
      providerId: dto.providerId,
    });

    return { response };
  }

  @Delete('history')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear conversation history' })
  @ApiResponse({ status: 204, description: 'History cleared' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async clearHistory(@CurrentUser() user: JwtPayload) {
    await this.agentService.clearHistory(user.sub);
  }
}
