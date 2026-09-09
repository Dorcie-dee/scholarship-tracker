import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailVerificationAndPasswordReset1788883224490 implements MigrationInterface {
  name = 'AddEmailVerificationAndPasswordReset1788883224490';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "token_hash" character varying(255) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "consumed_at" TIMESTAMP WITH TIME ZONE, "invalidated_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_52ac39dd8a28730c63aeb428c9" ON "password_reset_tokens" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_91185d86d5d7557b19abbb2868" ON "password_reset_tokens" ("token_hash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "email_verification_otps" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "otp_hash" character varying(255) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "attempts" integer NOT NULL DEFAULT '0', "consumed_at" TIMESTAMP WITH TIME ZONE, "invalidated_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_b8c838075d1f98c615fc385bdb6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d3c8234c4dd8cf400df8d614c2" ON "email_verification_otps" ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "is_verified" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_verification_otps" ADD CONSTRAINT "FK_d3c8234c4dd8cf400df8d614c2b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_verification_otps" DROP CONSTRAINT "FK_d3c8234c4dd8cf400df8d614c2b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "is_verified"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d3c8234c4dd8cf400df8d614c2"`,
    );
    await queryRunner.query(`DROP TABLE "email_verification_otps"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_91185d86d5d7557b19abbb2868"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_52ac39dd8a28730c63aeb428c9"`,
    );
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
  }
}
