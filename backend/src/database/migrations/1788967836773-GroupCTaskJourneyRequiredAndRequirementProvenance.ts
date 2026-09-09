import { MigrationInterface, QueryRunner } from 'typeorm';

export class GroupCTaskJourneyRequiredAndRequirementProvenance1788967836773 implements MigrationInterface {
  name = 'GroupCTaskJourneyRequiredAndRequirementProvenance1788967836773';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "requirements" ADD "copied_from_requirement_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_e998b20a18684ad24eb9b5f44f7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ALTER COLUMN "journey_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "requirements" ADD CONSTRAINT "FK_ffc61db495f2c0a27d3f9f1c292" FOREIGN KEY ("copied_from_requirement_id") REFERENCES "requirements"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_e998b20a18684ad24eb9b5f44f7" FOREIGN KEY ("journey_id") REFERENCES "application_journeys"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_e998b20a18684ad24eb9b5f44f7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "requirements" DROP CONSTRAINT "FK_ffc61db495f2c0a27d3f9f1c292"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ALTER COLUMN "journey_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_e998b20a18684ad24eb9b5f44f7" FOREIGN KEY ("journey_id") REFERENCES "application_journeys"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "requirements" DROP COLUMN "copied_from_requirement_id"`,
    );
  }
}
