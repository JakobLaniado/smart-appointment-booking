import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ProviderService } from './provider.service.js';
import { UpdateProviderDto } from './dto/update-provider.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';

@ApiTags('Providers')
@ApiBearerAuth()
@Controller('providers')
export class ProviderController {
  constructor(private readonly providerService: ProviderService) {}

  @Get()
  @ApiOperation({ summary: 'List all providers' })
  @ApiResponse({ status: 200, description: 'List of providers' })
  findAll() {
    return this.providerService.findAll();
  }

  @Get('me')
  @Roles('PROVIDER')
  @ApiOperation({ summary: 'Get current provider profile' })
  @ApiResponse({ status: 200, description: 'Current provider profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findMe(@CurrentUser() user: JwtPayload) {
    return this.providerService.findByUserId(user.sub);
  }

  @Patch('me')
  @Roles('PROVIDER')
  @ApiOperation({ summary: 'Update current provider profile' })
  @ApiResponse({ status: 200, description: 'Provider updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  update(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProviderDto) {
    return this.providerService.update(user.sub, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get provider by ID' })
  @ApiParam({ name: 'id', description: 'Provider ID' })
  @ApiResponse({ status: 200, description: 'Provider details' })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  findById(@Param('id') id: string) {
    return this.providerService.findById(id);
  }
}
