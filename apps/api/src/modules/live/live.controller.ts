import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ValkeyService } from '../../services/valkey.service';
import { StreamAuthGuard } from '../../auth/stream-auth.guard';
import { liveEventChannel } from '@blamr/types';

@Controller('v1/live')
export class LiveController {
  constructor(private readonly valkey: ValkeyService) {}

  /** Workspace-wide SSE feed: edges, run completion, blame results. */
  @Get('stream')
  @UseGuards(StreamAuthGuard)
  stream(@Req() req: { workspaceId: string }, @Res() res: Response) {
    const workspaceId = req.workspaceId;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const channel = liveEventChannel(workspaceId);
    const subscriber = this.valkey.subscribe(channel, (message) => {
      res.write(`data: ${message}\n\n`);
    });

    res.on('close', () => {
      subscriber.unsubscribe(channel);
      subscriber.quit();
    });

    res.write(
      `data: ${JSON.stringify({ type: 'connected', workspace_id: workspaceId, timestamp_ms: Date.now() })}\n\n`,
    );
  }
}
