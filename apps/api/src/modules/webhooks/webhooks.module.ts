import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookEntity } from '../../entities/webhook.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookEntity])],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
