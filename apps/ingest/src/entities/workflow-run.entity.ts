import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('workflow_runs')
export class WorkflowRunEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  workflow_id!: string;

  @Column('uuid')
  workspace_id!: string;

  @Column({ type: 'text', nullable: true })
  goal_snapshot!: string | null;

  @Column({ type: 'text', nullable: true })
  system_prompt!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  system_prompt_hash!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  system_prompt_agent_id!: string | null;
}
