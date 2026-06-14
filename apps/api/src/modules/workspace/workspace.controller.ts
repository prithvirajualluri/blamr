import { Controller, Get, Patch, Post, Body, UseGuards, Req } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { JwtOrApiKeyGuard } from '../../auth/jwt.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import type { WorkspaceSettings } from '@blamr/types';

@Controller('v1/workspace')
@UseGuards(JwtOrApiKeyGuard, RolesGuard)
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  @Roles('admin', 'member', 'viewer')
  get(@Req() req: { workspaceId: string }) {
    return this.workspaceService.get(req.workspaceId);
  }

  @Patch()
  @Roles('admin')
  update(@Req() req: { workspaceId: string }, @Body() body: Partial<WorkspaceSettings>) {
    return this.workspaceService.updateSettings(req.workspaceId, body);
  }

  @Post('rotate-keys')
  @Roles('admin')
  rotateKeys(@Req() req: { workspaceId: string }) {
    return this.workspaceService.rotateKeys(req.workspaceId);
  }
}
