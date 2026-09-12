import { QueryFailedError } from 'typeorm';
import { User } from '../../src/users/entities/user.entity';
import { ApplicationJourney } from '../../src/journeys/entities/application-journey.entity';
import { Application } from '../../src/applications/entities/application.entity';
import { Document } from '../../src/documents/entities/document.entity';
import { ApplicationDocument } from '../../src/applications/entities/application-document.entity';
import { Requirement } from '../../src/requirements/entities/requirement.entity';
import { RequirementType, DocumentType } from '../../src/types';
import { setupDbIntegrationTest } from './db-test-helper';

/**
 * Production hardening (Batch 12) — DB integration tests: real Postgres
 * (local `scholarship_os_test`, never Neon — see test-data-source.ts),
 * real constraints, real cascades. These prove things a mocked-repository
 * unit test structurally cannot: that a FK/CHECK/UNIQUE constraint this
 * codebase's design *depends on* actually exists in the live schema and
 * actually rejects what it's supposed to — not just that application code
 * calls the right methods in the right order against a fake that always
 * cooperates.
 *
 * Each test runs inside its own transaction, rolled back afterward — see
 * db-test-helper.ts. Nothing here ever commits.
 */
describe('Database constraints (real Postgres)', () => {
  const harness = setupDbIntegrationTest();
  beforeAll(harness.beforeAll);
  afterAll(harness.afterAll);
  beforeEach(harness.beforeEach);
  afterEach(harness.afterEach);

  const createUser = async (email: string) => {
    const { manager } = harness.getContext();
    return manager.save(
      manager.create(User, {
        email,
        passwordHash: 'not-a-real-hash',
        isVerified: false,
      }),
    );
  };

  const createJourney = async (userId: string) => {
    const { manager } = harness.getContext();
    return manager.save(
      manager.create(ApplicationJourney, {
        userId,
        title: 'MSc Computer Science — Test University',
      }),
    );
  };

  const createApplication = async (journeyId: string) => {
    const { manager } = harness.getContext();
    return manager.save(
      manager.create(Application, {
        journeyId,
        title: 'Admission Application',
      }),
    );
  };

  const createDocument = async (
    ownerId: string,
    overrides: Partial<Document> = {},
  ) => {
    const { manager } = harness.getContext();
    return manager.save(
      manager.create(Document, {
        ownerId,
        title: 'CV',
        documentType: DocumentType.CV,
        cloudinaryPublicId: `test-public-id-${Math.random()}`,
        cloudinaryUrl: 'https://res.cloudinary.invalid/fake.pdf',
        ...overrides,
      }),
    );
  };

  describe('users.email uniqueness (real UNIQUE index, not just an app-level check)', () => {
    it('rejects a second row with the exact same email', async () => {
      await createUser('duplicate@example.invalid');

      await expect(createUser('duplicate@example.invalid')).rejects.toThrow(
        QueryFailedError,
      );
    });
  });

  describe('Requirement CHECK constraint — at least one of opportunityId/applicationId', () => {
    it('rejects an insert with both null, even bypassing the service-layer check entirely', async () => {
      const { manager } = harness.getContext();

      await expect(
        manager.save(
          manager.create(Requirement, {
            requirementType: RequirementType.OTHER,
            description: 'orphaned requirement',
            opportunityId: null,
            applicationId: null,
          }),
        ),
      ).rejects.toThrow(QueryFailedError);
    });

    it('accepts an insert with only applicationId set', async () => {
      const user = await createUser('req-owner@example.invalid');
      const journey = await createJourney(user.id);
      const application = await createApplication(journey.id);
      const { manager } = harness.getContext();

      await expect(
        manager.save(
          manager.create(Requirement, {
            requirementType: RequirementType.OTHER,
            description: 'a real requirement',
            opportunityId: null,
            applicationId: application.id,
          }),
        ),
      ).resolves.toMatchObject({ applicationId: application.id });
    });
  });

  describe('Document.previousVersionId RESTRICT (Track 1 Group D, D-P2)', () => {
    it('refuses to delete a version another version still points to', async () => {
      const user = await createUser('doc-owner@example.invalid');
      const v1 = await createDocument(user.id);
      const { manager } = harness.getContext();
      await createDocument(user.id, {
        previousVersionId: v1.id,
        version: 2,
      });

      await expect(manager.delete(Document, v1.id)).rejects.toThrow(
        QueryFailedError,
      );
    });

    it('allows deleting a version nothing points to', async () => {
      const user = await createUser('doc-owner-2@example.invalid');
      const v1 = await createDocument(user.id);
      const { manager } = harness.getContext();

      await expect(manager.delete(Document, v1.id)).resolves.toBeDefined();
    });
  });

  describe('ApplicationDocument.documentId RESTRICT (Track 1 Group D)', () => {
    it('refuses to delete a Document that is currently attached to an Application', async () => {
      const user = await createUser('attach-owner@example.invalid');
      const journey = await createJourney(user.id);
      const application = await createApplication(journey.id);
      const document = await createDocument(user.id);
      const { manager } = harness.getContext();
      await manager.save(
        manager.create(ApplicationDocument, {
          applicationId: application.id,
          documentId: document.id,
          attachedAt: new Date(),
        }),
      );

      await expect(manager.delete(Document, document.id)).rejects.toThrow(
        QueryFailedError,
      );
    });
  });

  describe('ApplicationDocument unique(applicationId, documentId) — race-safe by construction', () => {
    it('rejects attaching the exact same document version to the same application twice', async () => {
      const user = await createUser('unique-attach@example.invalid');
      const journey = await createJourney(user.id);
      const application = await createApplication(journey.id);
      const document = await createDocument(user.id);
      const { manager } = harness.getContext();
      await manager.save(
        manager.create(ApplicationDocument, {
          applicationId: application.id,
          documentId: document.id,
          attachedAt: new Date(),
        }),
      );

      await expect(
        manager.save(
          manager.create(ApplicationDocument, {
            applicationId: application.id,
            documentId: document.id,
            attachedAt: new Date(),
          }),
        ),
      ).rejects.toThrow(QueryFailedError);
    });
  });

  describe('Cascade graph — Journey deletion (the AccountErasureService/ApplicationPurgeService assumption)', () => {
    it('deleting a Journey cascades away its Applications', async () => {
      const user = await createUser('cascade-owner@example.invalid');
      const journey = await createJourney(user.id);
      const application = await createApplication(journey.id);
      const { manager } = harness.getContext();

      await manager.delete(ApplicationJourney, journey.id);

      const found = await manager.findOne(Application, {
        where: { id: application.id },
        withDeleted: true, // even including soft-deleted rows — it must be genuinely GONE, not merely soft-deleted
      });
      expect(found).toBeNull();
    });

    it('deleting a User cascades through Journey to Application', async () => {
      const user = await createUser('cascade-owner-2@example.invalid');
      const journey = await createJourney(user.id);
      const application = await createApplication(journey.id);
      const { manager } = harness.getContext();

      await manager.delete(User, user.id);

      expect(
        await manager.findOne(ApplicationJourney, {
          where: { id: journey.id },
        }),
      ).toBeNull();
      expect(
        await manager.findOne(Application, {
          where: { id: application.id },
          withDeleted: true,
        }),
      ).toBeNull();
    });
  });

  /**
   * Production hardening (Batch 9's own forward pointer) — verifies, against
   * real Postgres, that TypeORM's `@DeleteDateColumn` on Application really
   * does exclude a soft-deleted row from `findOne()`/`find()` — the
   * property every downstream ownership check (RequirementsService/
   * TasksService/DeadlinesService calling `ApplicationsService.
   * findOwnedOrThrow()`) depends on to correctly 404 a soft-deleted
   * Application. Confirmed here empirically, not just asserted from
   * framework documentation.
   */
  describe('Application soft-delete — TypeORM @DeleteDateColumn exclusion (Batch 7 / Batch 9)', () => {
    it('excludes a soft-deleted Application from findOne() by default', async () => {
      const user = await createUser('soft-delete-owner@example.invalid');
      const journey = await createJourney(user.id);
      const application = await createApplication(journey.id);
      const { manager } = harness.getContext();

      await manager.softDelete(Application, application.id);

      expect(
        await manager.findOne(Application, { where: { id: application.id } }),
      ).toBeNull();
    });

    it('still finds it when withDeleted: true is explicitly requested', async () => {
      const user = await createUser('soft-delete-owner-2@example.invalid');
      const journey = await createJourney(user.id);
      const application = await createApplication(journey.id);
      const { manager } = harness.getContext();

      await manager.softDelete(Application, application.id);

      const found = await manager.findOne(Application, {
        where: { id: application.id },
        withDeleted: true,
      });
      expect(found).not.toBeNull();
      expect(found?.deletedAt).not.toBeNull();
    });

    it('the row still physically exists in the table — a real UPDATE, not a DELETE', async () => {
      const user = await createUser('soft-delete-owner-3@example.invalid');
      const journey = await createJourney(user.id);
      const application = await createApplication(journey.id);
      const { manager } = harness.getContext();

      await manager.softDelete(Application, application.id);

      const rawRow = await manager.query(
        'SELECT id, deleted_at FROM applications WHERE id = $1',
        [application.id],
      );
      expect(rawRow).toHaveLength(1);
      expect(rawRow[0].deleted_at).not.toBeNull();
    });
  });
});
