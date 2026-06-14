import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { JwtOrApiKeyGuard } from '../../auth/jwt.guard';

@Controller('v1/workflows')
@UseGuards(JwtOrApiKeyGuard)
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  list(@Req() req: { workspaceId: string }) {
    return this.workflowsService.list(req.workspaceId);
  }

  @Get(':id/accuracy-history')
  accuracyHistory(@Param('id') id: string) {
    return this.workflowsService.accuracyHistory(id);
  }
}
