import { Controller, Get, Patch, Param, Body } from "@nestjs/common";
import { ProviderService } from "./provider.service.js";
import { UpdateProviderDto } from "./dto/update-provider.dto.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { JwtPayload } from "../common/decorators/current-user.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";

@Controller("providers")
export class ProviderController {
  constructor(private readonly providerService: ProviderService) {}

  @Get()
  findAll() {
    return this.providerService.findAll();
  }

  @Get("me")
  @Roles("PROVIDER")
  findMe(@CurrentUser() user: JwtPayload) {
    return this.providerService.findByUserId(user.sub);
  }

  @Patch("me")
  @Roles("PROVIDER")
  update(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProviderDto) {
    return this.providerService.update(user.sub, dto);
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.providerService.findById(id);
  }
}
