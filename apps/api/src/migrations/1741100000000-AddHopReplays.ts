import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHopReplays1741100000000 implements MigrationInterface {
  name = 'AddHopReplays1741100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS hop_replays (
        id UUID PRIMARY KEY,
        run_id VARCHAR(64) NOT NULL,
        workspace_id VARCHAR(64) NOT NULL,
        hop_index INT NOT NULL,
        agent VARCHAR(128) NOT NULL,
        model VARCHAR(128),
        status VARCHAR(16) NOT NULL,
        note TEXT,
        result JSONB NOT NULL,
        created_at_ms BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_hop_replays_run_created
        ON hop_replays (run_id, created_at_ms DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_hop_replays_run_created;
      DROP TABLE IF EXISTS hop_replays;
    `);
  }
}
