import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { RunStatus, RunLayout, Complexity } from '@blamr/types';
import { WorkspaceEntity } from './workspace.entity';

@Entity('workflow_runs')
export class WorkflowRunEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  workflow_id!: string;

  @Column('uuid')
  workspace_id!: string;

  @ManyToOne(() => WorkspaceEntity)
  @JoinColumn({ name: 'workspace_id' })
  workspace!: WorkspaceEntity;

  @Column({ type: 'varchar', default: 'running' })
  status!: RunStatus;

  @Column({ type: 'varchar', default: 'Simple' })
  complexity!: Complexity;

  @Column({ type: 'bigint' })
  started_at!: number;

  @Column({ type: 'bigint', nullable: true })
  ended_at!: number | null;

  @Column({ type: 'bigint', default: 0 })
  duration_ms!: number;

  @Column({ type: 'bigint', default: 0 })
  total_tokens!: number;

  @Column({ type: 'float', default: 0 })
  total_cost_usd!: number;

  @Column({ type: 'text', nullable: true })
  error_summary!: string | null;

  @Column({ type: 'float', default: 0 })
  accuracy_score!: number;

  @Column({ type: 'jsonb', default: [] })
  agents!: string[];

  @Column({ type: 'varchar', default: 'linear' })
  layout!: RunLayout;

  @Column({ type: 'varchar', length: 512, nullable: true })
  title!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  confidence_gate!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
