import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import type { UserRole } from '@blamr/types';
import { UserEntity } from './user.entity';
import { WorkspaceEntity } from './workspace.entity';

@Entity('workspace_members')
@Index(['user_id', 'workspace_id'], { unique: true })
export class WorkspaceMemberEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  user_id!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column('uuid')
  workspace_id!: string;

  @ManyToOne(() => WorkspaceEntity)
  @JoinColumn({ name: 'workspace_id' })
  workspace!: WorkspaceEntity;

  @Column({ type: 'varchar', default: 'member' })
  role!: UserRole;

  @CreateDateColumn({ type: 'timestamptz' })
  joined_at!: Date;
}
