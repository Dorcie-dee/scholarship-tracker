import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2 missing capabilities:
 * - opportunity_sources.content_origin (manual | fetched)
 * - application_snapshots.supersedes_snapshot_id (append-only edit lineage)
 * - requirements AI suggestion columns (suggest ≠ mutate status)
 */
export class Phase2MissingCapabilities1789105000000 implements MigrationInterface {
  name = 'Phase2MissingCapabilities1789105000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."opportunity_sources_content_origin_enum" AS ENUM('manual', 'fetched')`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunity_sources" ADD "content_origin" "public"."opportunity_sources_content_origin_enum" NOT NULL DEFAULT 'manual'`,
    );

    await queryRunner.query(
      `ALTER TABLE "application_snapshots" ADD "supersedes_snapshot_id" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_application_snapshots_supersedes_snapshot_id" ON "application_snapshots" ("supersedes_snapshot_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_snapshots" ADD CONSTRAINT "FK_application_snapshots_supersedes_snapshot_id" FOREIGN KEY ("supersedes_snapshot_id") REFERENCES "application_snapshots"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."requirements_suggestion_source_enum" AS ENUM('heuristic', 'external')`,
    );
    await queryRunner.query(
      `ALTER TABLE "requirements" ADD "suggested_status" "public"."requirements_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "requirements" ADD "suggested_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "requirements" ADD "suggestion_rationale" character varying(1000)`,
    );
    await queryRunner.query(
      `ALTER TABLE "requirements" ADD "suggestion_source" "public"."requirements_suggestion_source_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "requirements" DROP COLUMN "suggestion_source"`,
    );
    await queryRunner.query(
      `ALTER TABLE "requirements" DROP COLUMN "suggestion_rationale"`,
    );
    await queryRunner.query(
      `ALTER TABLE "requirements" DROP COLUMN "suggested_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "requirements" DROP COLUMN "suggested_status"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."requirements_suggestion_source_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "application_snapshots" DROP CONSTRAINT "FK_application_snapshots_supersedes_snapshot_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_application_snapshots_supersedes_snapshot_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_snapshots" DROP COLUMN "supersedes_snapshot_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "opportunity_sources" DROP COLUMN "content_origin"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."opportunity_sources_content_origin_enum"`,
    );
  }
}
