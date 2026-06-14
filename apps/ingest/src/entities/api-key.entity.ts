import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';
import type { APIScope, KeyEnvironment, KeyStatus } from '@blamr/types';

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
