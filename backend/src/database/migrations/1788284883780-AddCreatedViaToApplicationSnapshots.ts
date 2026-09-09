import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreatedViaToApplicationSnapshots1788284883780 implements MigrationInterface {
  name = 'AddCreatedViaToApplicationSnapshots1788284883780';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."application_snapshots_created_via_enum" AS ENUM('manual', 'suggested')`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_snapshots" ADD "created_via" "public"."application_snapshots_created_via_enum" NOT NULL DEFAULT 'manual'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "application_snapshots" DROP COLUMN "created_via"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."application_snapshots_created_via_enum"`,
    );
  }
}
