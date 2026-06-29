import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBlamePresentationColumns1741000000000 implements MigrationInterface {
  name = 'AddBlamePresentationColumns1741000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE blame_reports
        ADD COLUMN IF NOT EXISTS propagation_chain JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS blame_confidence VARCHAR(16) DEFAULT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE blame_reports
        DROP COLUMN IF EXISTS propagation_chain,
        DROP COLUMN IF EXISTS blame_confidence;
    `);
  }
}
