import { Entity, Column, PrimaryColumn, Index } from 'typeorm';
import type { HopLlmReplayResult } from '@blamr/types';

@Entity('hop_replays')
@Index(['run_id', 'created_at_ms'])
export class HopReplayEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  run_id!: string;

  @Column({ type: 'varchar', length: 64 })
  workspace_id!: string;

  @Column({ type: 'int' })
  hop_index!: number;

  @Column({ type: 'varchar', length: 128 })
  agent!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  model!: string | null;

  @Column({ type: 'varchar', length: 16 })
  status!: string;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ type: 'jsonb' })
  result!: HopLlmReplayResult;

  @Column({ type: 'bigint' })
  created_at_ms!: number;
}
