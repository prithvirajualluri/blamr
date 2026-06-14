import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka!: Kafka;
  private producer!: Producer;

  async onModuleInit() {
    this.kafka = new Kafka({
      clientId: process.env.KAFKA_CLIENT_ID || 'blamr-ingest',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:19092').split(','),
    });
    this.producer = this.kafka.producer();
    await this.producer.connect();
  }

  async onModuleDestroy() {
    await this.producer?.disconnect();
  }

  async produce(topic: string, messages: Array<{ key?: string; value: string }>) {
    await this.producer.send({
      topic,
      messages: messages.map((m) => ({
        key: m.key,
        value: m.value,
      })),
    });
  }
}
