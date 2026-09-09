import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserRoleAndGroupBCheckConstraints1788965550585 implements MigrationInterface {
  name = 'AddUserRoleAndGroupBCheckConstraints1788965550585';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('user', 'admin')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "role" "public"."users_role_enum" NOT NULL DEFAULT 'user'`,
    );
    await queryRunner.query(
      `ALTER TABLE "requirements" ADD CONSTRAINT "CHK_a6bbd3d18c3e77ba0de5db71aa" CHECK ("opportunity_id" IS NOT NULL OR "application_id" IS NOT NULL)`,
    );
    await queryRunner.query(
      `ALTER TABLE "deadlines" ADD CONSTRAINT "CHK_978b754e075c627a4267afe0d0" CHECK ("opportunity_id" IS NOT NULL OR "application_id" IS NOT NULL OR "task_id" IS NOT NULL OR "requirement_id" IS NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "deadlines" DROP CONSTRAINT "CHK_978b754e075c627a4267afe0d0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "requirements" DROP CONSTRAINT "CHK_a6bbd3d18c3e77ba0de5db71aa"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}
