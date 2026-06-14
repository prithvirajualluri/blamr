import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { KeysService } from './keys.service';
import { JwtOrApiKeyGuard } from '../../auth/jwt.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@Controller('v1/keys')
@UseGuards(JwtOrApiKeyGuard, RolesGuard)
export class KeysController {
  constructor(private readonly keysService: KeysService) {}

  @Get()
  @Roles('admin', 'member', 'viewer')
  list(@Req() req: { workspaceId: string }) {
    return this.keysService.list(req.workspaceId);
  }

  @Post()
  @Roles('admin', 'member')
  create(
    @Req() req: { workspaceId: string },
    @Body() body: { name: string; environment: 'live' | 'test'; scopes: string[] },
  ) {
    return this.keysService.create({
      ...body,
      scopes: body.scopes as import('@blamr/types').APIScope[],
      workspace_id: req.workspaceId,
    });
  }

  @Delete(':id')
  @Roles('admin')
  revoke(@Req() req: { workspaceId: string }, @Param('id') id: string) {
    return this.keysService.revoke(id, req.workspaceId);
  }
}
