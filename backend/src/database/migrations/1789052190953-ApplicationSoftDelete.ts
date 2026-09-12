import { MigrationInterface, QueryRunner } from 'typeorm';

export class ApplicationSoftDelete1789052190953 implements MigrationInterface {
  name = 'ApplicationSoftDelete1789052190953';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "applications" ADD "deleted_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "applications" DROP COLUMN "deleted_at"`,
    );
  }
}
