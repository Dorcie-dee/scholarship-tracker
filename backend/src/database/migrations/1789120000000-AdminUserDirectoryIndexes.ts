import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin user directory keyset/filter indexes (EXPLAIN-justified on
 * scholarship_os_test with 500 seeded users):
 * - IDX_users_created_at_id: unfiltered + cursor ORDER BY createdAt DESC, id DESC
 * - IDX_users_role_created_at_id: role= filter + same order
 * No pg_trgm — leading-wildcard ILIKE remains a seq/filter path by design.
 */
export class AdminUserDirectoryIndexes1789120000000 implements MigrationInterface {
  name = 'AdminUserDirectoryIndexes1789120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_users_created_at_id" ON "users" ("createdAt" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_role_created_at_id" ON "users" ("role", "createdAt" DESC, "id" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_users_role_created_at_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_users_created_at_id"`);
  }
}
