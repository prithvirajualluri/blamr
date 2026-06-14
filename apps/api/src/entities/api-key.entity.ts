import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { APIScope, KeyEnvironment, KeyStatus } from '@blamr/types';
import { WorkspaceEntity } from './workspace.entity';

@Entity('api_keys')
export class ApiKeyEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  key_id!: string;

  @Column()
  key_hash!: string;

  @Column()
  key_prefix!: string;

  @Column()
  name!: string;

  @Column('uuid')
  workspace_id!: string;

  @ManyToOne(() => WorkspaceEntity)
  @JoinColumn({ name: 'workspace_id' })
  workspace!: WorkspaceEntity;

  @Column({ type: 'varchar', default: 'live' })
  environment!: KeyEnvironment;

  @Column({ type: 'jsonb', default: [] })
  scopes!: APIScope[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  last_used_at!: Date | null;

  @Column({ type: 'bigint', default: 0 })
  call_count!: number;

  @Column({ type: 'varchar', default: 'active' })
  status!: KeyStatus;
}
