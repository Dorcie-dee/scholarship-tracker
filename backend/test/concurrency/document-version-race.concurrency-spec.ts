import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from '../../src/users/entities/user.entity';
import { Document } from '../../src/documents/entities/document.entity';
import { ApplicationDocument } from '../../src/applications/entities/application-document.entity';
import { DocumentsService } from '../../src/documents/documents.service';
import { DocumentType } from '../../src/types';
import {
  createTestDataSource,
  ensureTestSchemaUpToDate,
} from '../db-integration/test-data-source';

/**
 * Production hardening (Batch 14) — genuine concurrency testing: real,
 * simultaneously-in-flight database transactions against real local
 * Postgres (never a sequential simulation over a mocked repository, which
 * is all a unit test can ever do — see documents.service.spec.ts's "a
 * version chain still works correctly after a rejected concurrent attempt",
 * which calls `uploadNewVersion()` twice in sequence and can only prove the
 * CODE PATH is correct, not that the actual row lock genuinely serializes
 * two requests that arrive at the same instant).
 *
 * Uses the REAL `DocumentsService` bound to REAL repositories from a real
 * DataSource — not the DB-integration harness's per-test rolled-back
 * transaction (two truly concurrent operations can't both run inside one
 * transaction; each needs its own real, separately-committed connection).
 * Only `CloudinaryService` is a stub (no real network call — consistent
 * with this project's standing rule never to use real Cloudinary
 * credentials in tests); everything else — the row lock, the transaction,
 * the actual `ConflictException` decision — is the real production code.
 */
describe('Document version upload race (real concurrent Postgres transactions)', () => {
  let dataSource: DataSource;
  let service: DocumentsService;
  const testEmailPrefix = `concurrency-doc-version-${process.pid}-`;

  const fakeCloudinaryService = {
    uploadBuffer: jest.fn(async () => ({
      publicId: `concurrency-test-${Math.random()}`,
      url: 'https://res.cloudinary.invalid/fake.pdf',
      secureUrl: 'https://res.cloudinary.invalid/fake.pdf',
      bytes: 1024,
      format: 'pdf',
      resourceType: 'raw',
    })),
    deleteByPublicId: jest.fn(async () => {}),
  };
  const fakeConfigService = { get: jest.fn(() => ({})) };

  const fakeFile = (): Express.Multer.File =>
    ({
      buffer: Buffer.from('fake-file-contents'),
      originalname: 'file.pdf',
      mimetype: 'application/pdf',
      size: 1024,
    }) as Express.Multer.File;

  beforeAll(async () => {
    dataSource = createTestDataSource();
    await dataSource.initialize();
    await ensureTestSchemaUpToDate(dataSource);

    service = new DocumentsService(
      dataSource.getRepository(Document),
      dataSource.getRepository(ApplicationDocument),
      fakeCloudinaryService as any,
      fakeConfigService as any,
    );
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM users WHERE email LIKE $1', [
      `${testEmailPrefix}%`,
    ]);
    await dataSource.destroy();
  });

  it('exactly one of two truly concurrent uploadNewVersion() calls succeeds; the other gets a clean ConflictException, never a duplicate version', async () => {
    const users = dataSource.getRepository(User);
    const user = await users.save(
      users.create({
        email: `${testEmailPrefix}${Date.now()}@example.invalid`,
        passwordHash: 'not-a-real-hash',
      }),
    );
    const v1 = await service.uploadNew(
      user.id,
      { title: 'CV', documentType: DocumentType.CV },
      fakeFile(),
    );

    // Both calls start from the SAME v1.id, genuinely in parallel — Promise.all
    // schedules both `uploadNewVersion()` calls' async work interleaved on
    // the event loop, and each opens its OWN real transaction/connection
    // against Postgres, so the second one to reach `SELECT ... FOR UPDATE`
    // genuinely blocks on the real row lock the first one is holding —
    // this is what a mocked-repository unit test cannot exercise.
    const results = await Promise.allSettled([
      service.uploadNewVersion(user.id, v1.id, fakeFile(), {}),
      service.uploadNewVersion(user.id, v1.id, fakeFile(), {}),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);

    // The database itself, not just the returned values, has exactly one
    // v2 row — no duplicate-numbered siblings.
    const allVersions = await dataSource.query(
      'SELECT id, version FROM documents WHERE owner_id = $1 ORDER BY version',
      [user.id],
    );
    expect(allVersions).toHaveLength(2);
    expect(allVersions.map((r: { version: number }) => r.version)).toEqual([
      1, 2,
    ]);

    const currentRows = await dataSource.query(
      'SELECT id FROM documents WHERE owner_id = $1 AND is_current = true',
      [user.id],
    );
    expect(currentRows).toHaveLength(1);
  });

  it('three genuinely concurrent attempts against the same version: still exactly one winner', async () => {
    const users = dataSource.getRepository(User);
    const user = await users.save(
      users.create({
        email: `${testEmailPrefix}three-way-${Date.now()}@example.invalid`,
        passwordHash: 'not-a-real-hash',
      }),
    );
    const v1 = await service.uploadNew(user.id, { title: 'CV' }, fakeFile());

    const results = await Promise.allSettled([
      service.uploadNewVersion(user.id, v1.id, fakeFile(), {}),
      service.uploadNewVersion(user.id, v1.id, fakeFile(), {}),
      service.uploadNewVersion(user.id, v1.id, fakeFile(), {}),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(2);

    const versions = await dataSource.query(
      'SELECT version FROM documents WHERE owner_id = $1',
      [user.id],
    );
    expect(
      new Set(versions.map((r: { version: number }) => r.version)).size,
    ).toBe(versions.length); // every version number is unique — no duplicates under 3-way contention
  });
});
