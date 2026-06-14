import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConfidenceGate1740100000000 implements MigrationInterface {
  name = 'AddConfidenceGate1740100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workflow_runs
        ADD COLUMN IF NOT EXISTS confidence_gate JSONB DEFAULT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workflow_runs DROP COLUMN IF EXISTS confidence_gate;
    `);
  }
}
