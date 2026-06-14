import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { JwtOrApiKeyGuard } from '../../auth/jwt.guard';

@Controller('v1/agents')
@UseGuards(JwtOrApiKeyGuard)
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  list(
    @Req() req: { workspaceId: string },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('q') q?: string,
  ) {
    return this.agentsService.list(req.workspaceId, {
      limit: limit ? parseInt(limit, 10) : 40,
      offset: offset ? parseInt(offset, 10) : 0,
      q,
    });
  }
}
