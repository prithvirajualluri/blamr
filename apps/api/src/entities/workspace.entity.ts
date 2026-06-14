import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import type { Plan, WorkspaceSettings } from '@blamr/types';

@Entity('workspaces')
export class WorkspaceEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ unique: true })
  slug!: string;

  @Column()
  owner_email!: string;

  @Column({ type: 'varchar', default: 'oss' })
  plan!: Plan;

  @Column({ type: 'jsonb', default: {} })
  settings!: WorkspaceSettings;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
