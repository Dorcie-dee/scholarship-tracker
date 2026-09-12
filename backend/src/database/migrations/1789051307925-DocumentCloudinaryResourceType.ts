import { MigrationInterface, QueryRunner } from 'typeorm';

export class DocumentCloudinaryResourceType1789051307925 implements MigrationInterface {
  name = 'DocumentCloudinaryResourceType1789051307925';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "documents" ADD "cloudinary_resource_type" character varying(32)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "documents" DROP COLUMN "cloudinary_resource_type"`,
    );
  }
}
