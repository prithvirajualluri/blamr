import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { JwtOrApiKeyGuard } from '../../auth/jwt.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import type { WebhookEvent } from '@blamr/types';

@Controller('v1/webhooks')
@UseGuards(JwtOrApiKeyGuard, RolesGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get()
  @Roles('admin', 'member')
  list(@Req() req: { workspaceId: string }) {
    return this.webhooksService.list(req.workspaceId);
  }

  @Post()
  @Roles('admin')
  create(
    @Req() req: { workspaceId: string },
    @Body() body: { name: string; url: string; events: WebhookEvent[]; secret: string },
  ) {
    return this.webhooksService.create({ ...body, workspace_id: req.workspaceId });
  }

  @Delete(':id')
  @Roles('admin')
  delete(@Req() req: { workspaceId: string }, @Param('id') id: string) {
    return this.webhooksService.delete(id, req.workspaceId);
  }

  @Post(':id/test')
  @Roles('admin')
  test(@Req() req: { workspaceId: string }, @Param('id') id: string) {
    return this.webhooksService.test(id, req.workspaceId);
  }
}
