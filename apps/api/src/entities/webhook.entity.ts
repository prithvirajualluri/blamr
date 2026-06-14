import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { WebhookEvent } from '@blamr/types';
import { WorkspaceEntity } from './workspace.entity';

@Entity('webhooks')
export class WebhookEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  workspace_id!: string;

  @ManyToOne(() => WorkspaceEntity)
  @JoinColumn({ name: 'workspace_id' })
  workspace!: WorkspaceEntity;

  @Column()
  name!: string;

  @Column()
  url!: string;

  @Column({ type: 'jsonb', default: [] })
  events!: WebhookEvent[];

  @Column()
  secret!: string;

  @Column({ type: 'bigint', default: 0 })
  delivery_count!: number;

  @Column({ type: 'varchar', default: 'active' })
  status!: 'active' | 'disabled';

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
