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
import { WorkspaceEntity } from './workspace.entity';
import { UserEntity } from './user.entity';

@Entity('workspace_invites')
export class WorkspaceInviteEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  workspace_id!: string;

  @ManyToOne(() => WorkspaceEntity)
  @JoinColumn({ name: 'workspace_id' })
  workspace!: WorkspaceEntity;

  @Column()
  email!: string;

  @Column({ type: 'varchar', default: 'member' })
  role!: UserRole;

  @Index({ unique: true })
  @Column()
  token!: string;

  @Column('uuid')
  invited_by_user_id!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'invited_by_user_id' })
  invited_by!: UserEntity;

  @Column({ type: 'timestamptz' })
  expires_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  accepted_at!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
