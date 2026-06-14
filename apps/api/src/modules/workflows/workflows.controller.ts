import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { WorkflowsService, type WorkflowHealth } from './workflows.service';
import { JwtOrApiKeyGuard } from '../../auth/jwt.guard';

@Controller('v1/workflows')
@UseGuards(JwtOrApiKeyGuard)
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  list(
    @Req() req: { workspaceId: string },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('q') q?: string,
    @Query('health') health?: WorkflowHealth,
    @Query('sort') sort?: string,
  ) {
    return this.workflowsService.list(req.workspaceId, {
      limit: limit ? parseInt(limit, 10) : 40,
      offset: offset ? parseInt(offset, 10) : 0,
      q,
      health: health ?? 'all',
      sort,
    });
  }

  @Get(':id/accuracy-history')
  accuracyHistory(@Req() req: { workspaceId: string }, @Param('id') id: string) {
    return this.workflowsService.accuracyHistory(id, req.workspaceId);
  }
}
