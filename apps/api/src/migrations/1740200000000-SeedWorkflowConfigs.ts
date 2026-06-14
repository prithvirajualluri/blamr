import { MigrationInterface, QueryRunner } from 'typeorm';

const SAMPLE_WORKFLOW_CONFIGS = {
  'customer-support': {
    confidence_accept_level: 0.78,
    confidence_gate_mode: 'min',
    domain_type: 'support',
  },
  'incident-triage': {
    confidence_accept_level: 0.72,
    confidence_gate_mode: 'final',
    domain_type: 'incident',
  },
  'research-assistant': {
    confidence_accept_level: 0.7,
    confidence_gate_mode: 'final',
    domain_type: 'generic',
  },
};

export class SeedWorkflowConfigs1740200000000 implements MigrationInterface {
  name = 'SeedWorkflowConfigs1740200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE workspaces
       SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
         'workflow_configs',
         COALESCE(settings->'workflow_configs', '{}'::jsonb) || $1::jsonb
       )
       WHERE id = '00000000-0000-4000-a000-000000000001'`,
      [JSON.stringify(SAMPLE_WORKFLOW_CONFIGS)],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE workspaces
       SET settings = settings - 'workflow_configs'
       WHERE id = '00000000-0000-4000-a000-000000000001'`,
    );
  }
}
