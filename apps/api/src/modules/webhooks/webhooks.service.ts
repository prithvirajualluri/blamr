import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookEntity } from '../../entities/webhook.entity';
import { v4 as uuidv4 } from 'uuid';
import type { WebhookEvent } from '@blamr/types';

@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(WebhookEntity)
    private readonly webhookRepo: Repository<WebhookEntity>,
  ) {}

  async list(workspaceId: string) {
    return this.webhookRepo.find({ where: { workspace_id: workspaceId } });
  }

  async create(data: {
    name: string;
    url: string;
    events: WebhookEvent[];
    secret: string;
    workspace_id: string;
  }) {
    const webhook = this.webhookRepo.create({
      id: uuidv4(),
      ...data,
      delivery_count: 0,
      status: 'active',
    });
    return this.webhookRepo.save(webhook);
  }

  async delete(id: string, workspaceId: string) {
    await this.webhookRepo.delete({ id, workspace_id: workspaceId });
    return { deleted: true };
  }

  async test(id: string, workspaceId: string) {
    const webhook = await this.webhookRepo.findOne({ where: { id, workspace_id: workspaceId } });
    if (!webhook) return { success: false, error: 'Webhook not found' };

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Blamr-Secret': webhook.secret },
        body: JSON.stringify({ event: 'test', timestamp: Date.now() }),
      });
      return { success: response.ok, status: response.status };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}
