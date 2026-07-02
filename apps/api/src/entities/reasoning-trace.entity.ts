import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('reasoning_traces')
export class ReasoningTraceEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  edge_id!: string;

  @Column()
  run_id!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar', length: 255 })
  model!: string;

  @Column({ type: 'int', nullable: true })
  token_count!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
