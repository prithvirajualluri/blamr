import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import type { AgentBlame } from '@blamr/types';
import { WorkflowRunEntity } from './workflow-run.entity';

@Entity('blame_reports')
export class BlameReportEntity {
  @PrimaryColumn()
  run_id!: string;

  @OneToOne(() => WorkflowRunEntity)
  @JoinColumn({ name: 'run_id' })
  run!: WorkflowRunEntity;

  @Column()
  root_cause_agent!: string;

  @Column({ type: 'float' })
  root_cause_pct!: number;

  @Column({ default: 'backward_bfs_shapley' })
  method!: string;

  @Column({ type: 'bigint' })
  computed_at_ms!: number;

  @Column({ type: 'jsonb', default: [] })
  agents!: AgentBlame[];

  @Column({ type: 'jsonb', default: [] })
  hop_analysis!: import('@blamr/types').HopDriftAnalysis[];

  @Column({ type: 'jsonb', nullable: true })
  ml_fusion!: import('@blamr/types').MlFusionMeta | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
