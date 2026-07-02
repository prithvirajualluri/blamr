import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRunMetadataAndReasoningTraces1741200000000 implements MigrationInterface {
  name = 'AddRunMetadataAndReasoningTraces1741200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workflow_runs
        ADD COLUMN IF NOT EXISTS goal_snapshot TEXT,
        ADD COLUMN IF NOT EXISTS system_prompt TEXT,
        ADD COLUMN IF NOT EXISTS system_prompt_hash VARCHAR(64),
        ADD COLUMN IF NOT EXISTS system_prompt_agent_id VARCHAR(255);

      CREATE TABLE IF NOT EXISTS reasoning_traces (
        id VARCHAR(64) PRIMARY KEY,
        edge_id VARCHAR(64) NOT NULL,
        run_id VARCHAR(64) NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        model VARCHAR(255) NOT NULL,
        token_count INT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_reasoning_traces_run_id
        ON reasoning_traces (run_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reasoning_traces_edge_id
        ON reasoning_traces (edge_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_reasoning_traces_edge_id;
      DROP INDEX IF EXISTS idx_reasoning_traces_run_id;
      DROP TABLE IF EXISTS reasoning_traces;
      ALTER TABLE workflow_runs
        DROP COLUMN IF EXISTS system_prompt_agent_id,
        DROP COLUMN IF EXISTS system_prompt_hash,
        DROP COLUMN IF EXISTS system_prompt,
        DROP COLUMN IF EXISTS goal_snapshot;
    `);
  }
}
