import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductionHardeningIndexesAndConstraints1789051022641 implements MigrationInterface {
  name = 'ProductionHardeningIndexesAndConstraints1789051022641';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_a7ab4fd82c654c85b9de53d971" ON "refresh_sessions" ("user_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a7ab4fd82c654c85b9de53d971"`,
    );
  }
}
