import { Controller, Get, Param, Query, UseGuards, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { RunsService } from './runs.service';
import { JwtOrApiKeyGuard } from '../../auth/jwt.guard';
import { ValkeyService } from '../../services/valkey.service';

@Controller('v1/runs')
@UseGuards(JwtOrApiKeyGuard)
export class RunsController {
  constructor(
    private readonly runsService: RunsService,
    private readonly valkey: ValkeyService,
  ) {}

  @Get()
  async list(
    @Req() req: { workspaceId: string },
    @Query('status') status?: string,
    @Query('workflow_id') workflow_id?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.runsService.list({
      workspace_id: req.workspaceId,
      status,
      workflow_id,
      q,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get(':id')
  async get(@Req() req: { workspaceId: string }, @Param('id') id: string) {
    return this.runsService.getById(id, req.workspaceId);
  }

  @Get(':id/blame')
  async blame(@Req() req: { workspaceId: string }, @Param('id') id: string) {
    return this.runsService.getBlame(id, req.workspaceId);
  }

  @Get(':id/confidence-trace')
  async confidenceTrace(@Req() req: { workspaceId: string }, @Param('id') id: string) {
    return this.runsService.getConfidenceTrace(id, req.workspaceId);
  }

  @Get(':id/intent-trace')
  async intentTrace(@Req() req: { workspaceId: string }, @Param('id') id: string) {
    return this.runsService.getIntentTrace(id, req.workspaceId);
  }

  @Get(':id/export')
  async export(
    @Req() req: { workspaceId: string },
    @Param('id') id: string,
    @Query('format') format?: string,
    @Res() res?: Response,
  ) {
    const data = await this.runsService.exportRun(id, req.workspaceId);
    if (format === 'eu-ai-act') {
      res?.setHeader('Content-Type', 'application/x-ndjson');
      res?.setHeader('Content-Disposition', `attachment; filename="${id}-audit.ndjson"`);
      return res?.send(data);
    }
    return { data };
  }

  @Get(':id/stream')
  async stream(@Param('id') id: string, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const channel = `blame.completed:${id}`;
    const subscriber = this.valkey.subscribe(channel, (message) => {
      res.write(`data: ${message}\n\n`);
    });

    res.on('close', () => {
      subscriber.unsubscribe(channel);
      subscriber.quit();
    });

    res.write(`data: ${JSON.stringify({ type: 'connected', run_id: id })}\n\n`);
  }
}
