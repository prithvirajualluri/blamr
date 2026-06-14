import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1739404800000 implements MigrationInterface {
  name = 'Init1739404800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        owner_email VARCHAR(255) NOT NULL,
        plan VARCHAR(50) DEFAULT 'oss',
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY,
        key_id VARCHAR(32) NOT NULL UNIQUE,
        key_hash VARCHAR(255) NOT NULL,
        key_prefix VARCHAR(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        workspace_id UUID REFERENCES workspaces(id),
        environment VARCHAR(10) DEFAULT 'live',
        scopes JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        call_count BIGINT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active'
      );

      CREATE INDEX idx_api_keys_key_id ON api_keys(key_id);
      CREATE INDEX idx_api_keys_workspace ON api_keys(workspace_id);

      CREATE TABLE IF NOT EXISTS workflow_runs (
        id VARCHAR(64) PRIMARY KEY,
        workflow_id VARCHAR(255) NOT NULL,
        workspace_id UUID REFERENCES workspaces(id),
        status VARCHAR(20) DEFAULT 'running',
        complexity VARCHAR(20) DEFAULT 'Simple',
        started_at BIGINT NOT NULL,
        ended_at BIGINT,
        duration_ms BIGINT DEFAULT 0,
        total_tokens BIGINT DEFAULT 0,
        total_cost_usd FLOAT DEFAULT 0,
        error_summary TEXT,
        accuracy_score FLOAT DEFAULT 0,
        agents JSONB DEFAULT '[]',
        layout VARCHAR(20) DEFAULT 'linear',
        title VARCHAR(512),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX idx_workflow_runs_workspace ON workflow_runs(workspace_id);
      CREATE INDEX idx_workflow_runs_workflow ON workflow_runs(workflow_id);
      CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);

      CREATE TABLE IF NOT EXISTS blame_reports (
        run_id VARCHAR(64) PRIMARY KEY REFERENCES workflow_runs(id),
        root_cause_agent VARCHAR(255) NOT NULL,
        root_cause_pct FLOAT NOT NULL,
        method VARCHAR(50) DEFAULT 'backward_bfs_shapley',
        computed_at_ms BIGINT NOT NULL,
        agents JSONB DEFAULT '[]',
        hop_analysis JSONB DEFAULT '[]',
        ml_fusion JSONB DEFAULT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS webhooks (
        id UUID PRIMARY KEY,
        workspace_id UUID REFERENCES workspaces(id),
        name VARCHAR(255) NOT NULL,
        url TEXT NOT NULL,
        events JSONB DEFAULT '[]',
        secret VARCHAR(255) NOT NULL,
        delivery_count BIGINT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS seed_state (
        workspace_id UUID PRIMARY KEY REFERENCES workspaces(id),
        seeded BOOLEAN DEFAULT FALSE,
        seeded_at TIMESTAMPTZ
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS seed_state;
      DROP TABLE IF EXISTS webhooks;
      DROP TABLE IF EXISTS blame_reports;
      DROP TABLE IF EXISTS workflow_runs;
      DROP TABLE IF EXISTS api_keys;
      DROP TABLE IF EXISTS workspaces;
    `);
  }
}
