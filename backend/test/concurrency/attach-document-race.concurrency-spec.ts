import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from '../../src/users/entities/user.entity';
import { ApplicationJourney } from '../../src/journeys/entities/application-journey.entity';
import { Application } from '../../src/applications/entities/application.entity';
import { Document } from '../../src/documents/entities/document.entity';
import { ApplicationDocument } from '../../src/applications/entities/application-document.entity';
import { ApplicationDocumentsService } from '../../src/applications/application-documents.service';
import {
  createTestDataSource,
  ensureTestSchemaUpToDate,
} from '../db-integration/test-data-source';

/**
 * Production hardening (Batch 14) — genuine concurrency: proves
 * `ApplicationDocumentsService.attach()`'s race-safety claim (see its own
 * doc comment — "duplicate attachment is guarded by the database
 * constraint alone... a unique constraint closes for free" the race window
 * a pre-check can't) against REAL simultaneous requests, not a sequential
 * simulation. The two ownership pre-checks (`applicationsService.
 * findOwnedOrThrow`/`documentsService.findOwnedOrThrow`) are stubbed —
 * their own correctness is already covered by unit tests, and they don't
 * participate in the race under test at all (both always resolve to the
 * same, already-real, already-owned rows here); what this test exercises
 * for real is the one write (`applicationDocuments.save()`) that actually
 * races, against the real UNIQUE(application_id, document_id) constraint.
 */
describe('Attach-document race (real concurrent Postgres transactions)', () => {
  let dataSource: DataSource;
  const testEmailPrefix = `concurrency-attach-${process.pid}-`;

  beforeAll(async () => {
    dataSource = createTestDataSource();
    await dataSource.initialize();
    await ensureTestSchemaUpToDate(dataSource);
  });

  afterAll(async () => {
    // Deletion order matters here — same reasoning as
    // AccountErasureService (see decisions.md, "Batch 7"): a plain
    // `DELETE FROM users` would try to CASCADE-delete this user's Documents
    // while an ApplicationDocument row (itself only reachable by cascading
    // through Journey → Application, a SEPARATE cascade path) still
    // references one of them — `ApplicationDocument.documentId` is
    // `RESTRICT`, so that raw delete fails. Deleting Journeys first clears
    // the ApplicationDocument rows (cascades through Application) before
    // Users (and therefore Documents) are deleted.
    await dataSource.query(
      `DELETE FROM application_journeys WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [`${testEmailPrefix}%`],
    );
    await dataSource.query('DELETE FROM users WHERE email LIKE $1', [
      `${testEmailPrefix}%`,
    ]);
    await dataSource.destroy();
  });

  it('exactly one of five genuinely concurrent attach() calls for the same (application, document) pair succeeds', async () => {
    const users = dataSource.getRepository(User);
    const journeys = dataSource.getRepository(ApplicationJourney);
    const applications = dataSource.getRepository(Application);
    const documents = dataSource.getRepository(Document);

    const user = await users.save(
      users.create({
        email: `${testEmailPrefix}${Date.now()}@example.invalid`,
        passwordHash: 'not-a-real-hash',
      }),
    );
    const journey = await journeys.save(
      journeys.create({ userId: user.id, title: 'Test Journey' }),
    );
    const application = await applications.save(
      applications.create({ journeyId: journey.id, title: 'Test Application' }),
    );
    const document = await documents.save(
      documents.create({
        ownerId: user.id,
        title: 'CV',
        cloudinaryPublicId: `concurrency-attach-test-${Math.random()}`,
        cloudinaryUrl: 'https://res.cloudinary.invalid/fake.pdf',
      }),
    );

    const service = new ApplicationDocumentsService(
      dataSource.getRepository(ApplicationDocument),
      {
        findOwnedOrThrow: jest.fn(async () => application),
      } as any,
      {
        findOwnedOrThrow: jest.fn(async () => document),
      } as any,
    );

    const attempts = Array.from({ length: 5 }, () =>
      service.attach(user.id, application.id, { documentId: document.id }),
    );
    const results = await Promise.allSettled(attempts);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(ConflictException);
    }

    const rows = await dataSource.query(
      'SELECT id FROM application_documents WHERE application_id = $1 AND document_id = $2',
      [application.id, document.id],
    );
    expect(rows).toHaveLength(1); // the database itself has exactly one row, not five
  });
});
