import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMlBlameColumns1740000000000 implements MigrationInterface {
  name = 'AddMlBlameColumns1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE blame_reports
        ADD COLUMN IF NOT EXISTS hop_analysis JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS ml_fusion JSONB DEFAULT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE blame_reports
        DROP COLUMN IF EXISTS hop_analysis,
        DROP COLUMN IF EXISTS ml_fusion;
    `);
  }
}
