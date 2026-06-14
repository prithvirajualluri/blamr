import { Module } from '@nestjs/common';
import {
  ClickHouseWriterService,
  RunAggregatorService,
  WebhookDispatcherService,
} from './workers.service';
import { BlameProcessorService } from './blame-processor.service';

@Module({
  providers: [
    ClickHouseWriterService,
    RunAggregatorService,
    WebhookDispatcherService,
    BlameProcessorService,
  ],
})
export class AppModule {}
