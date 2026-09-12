import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScalabilityReviewCompositeIndexes1789072594750 implements MigrationInterface {
  name = 'ScalabilityReviewCompositeIndexes1789072594750';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_9b01d1c3e90926b2d4a4e84ec0" ON "programmes" ("name", "id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_495093bb7992c207be6e89eb92" ON "universities" ("name", "id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5582866d94693a0a04cdf9c5c1" ON "opportunities" ("createdAt", "id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5582866d94693a0a04cdf9c5c1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_495093bb7992c207be6e89eb92"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9b01d1c3e90926b2d4a4e84ec0"`,
    );
  }
}
