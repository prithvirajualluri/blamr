import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { JwtOrApiKeyGuard } from '../../auth/jwt.guard';

@Controller('v1/metrics')
@UseGuards(JwtOrApiKeyGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('overview')
  overview(@Req() req: { workspaceId: string }) {
    return this.metricsService.overview(req.workspaceId);
  }
}
