import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApplicationDocumentUniqueConstraint1788080105496 implements MigrationInterface {
  name = 'AddApplicationDocumentUniqueConstraint1788080105496';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "application_documents" ADD CONSTRAINT "UQ_7f837e4e352186f29746f428de4" UNIQUE ("application_id", "document_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "application_documents" DROP CONSTRAINT "UQ_7f837e4e352186f29746f428de4"`,
    );
  }
}
