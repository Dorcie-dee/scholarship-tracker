import { MigrationInterface, QueryRunner } from 'typeorm';

export class GroupDDocumentVersionChainIntegrity1788989842296 implements MigrationInterface {
  name = 'GroupDDocumentVersionChainIntegrity1788989842296';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT "FK_85bb251d329c62799e477bc9058"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "FK_85bb251d329c62799e477bc9058" FOREIGN KEY ("previous_version_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT "FK_85bb251d329c62799e477bc9058"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "FK_85bb251d329c62799e477bc9058" FOREIGN KEY ("previous_version_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }
}
