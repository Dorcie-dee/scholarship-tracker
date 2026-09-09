import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { DocumentType } from '../types';
import { ApplicationDocumentsService } from './application-documents.service';

/**
 * Covers the Application → ApplicationDocument → exact Document version
 * guarantee (spec §20, phase-1o5.txt Checkpoint 9A): ownership is enforced on
 * both sides, the exact version supplied is what gets pinned (not whichever
 * is currently "current"), duplicate attachment is rejected via the database
 * constraint (not a pre-check), and listing loads the pinned version in one
 * joined query.
 */
describe('ApplicationDocumentsService', () => {
  const userId = 'user-1';
  const applicationId = 'application-1';

  let applicationDocuments: any;
  let applicationsService: any;
  let documentsService: any;
  let service: ApplicationDocumentsService;

  const makeDocument = (overrides: Record<string, unknown> = {}) => ({
    id: 'document-1',
    ownerId: userId,
    title: 'CV',
    documentType: DocumentType.CV,
    version: 1,
    cloudinaryUrl: 'https://res.cloudinary.invalid/cv-v1.pdf',
    isCurrent: true,
    ...overrides,
  });

  beforeEach(() => {
    const rows = new Map<string, any>();
    let nextId = 1;

    applicationDocuments = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => {
        const withId = {
          id: row.id ?? `application-document-${nextId++}`,
          ...row,
        };
        rows.set(withId.id, withId);
        return withId;
      }),
      find: jest.fn(async ({ where }: any) =>
        [...rows.values()].filter(
          (row) => row.applicationId === where.applicationId,
        ),
      ),
      findOne: jest.fn(async ({ where }: any) => {
        return (
          [...rows.values()].find((row) =>
            Object.entries(where).every(([key, value]) => row[key] === value),
          ) ?? null
        );
      }),
      delete: jest.fn(async (id: string) => {
        rows.delete(id);
      }),
    };
    applicationsService = {
      findOwnedOrThrow: jest.fn(async (id: string) => ({
        id,
        journeyId: 'journey-1',
      })),
    };
    documentsService = {
      findOwnedOrThrow: jest.fn(async (id: string) => makeDocument({ id })),
    };

    service = new ApplicationDocumentsService(
      applicationDocuments,
      applicationsService,
      documentsService,
    );
  });

  it('attaches the exact document version, verifying ownership on both the application and the document', async () => {
    const document = makeDocument({ id: 'document-cv-v2', version: 2 });
    documentsService.findOwnedOrThrow.mockResolvedValueOnce(document);

    const link = await service.attach(userId, applicationId, {
      documentId: document.id,
      label: 'Primary CV',
    });

    expect(link.applicationId).toBe(applicationId);
    expect(link.documentId).toBe(document.id);
    expect(link.document).toBe(document);
    expect(link.document.version).toBe(2);
    expect(link.label).toBe('Primary CV');
    expect(applicationsService.findOwnedOrThrow).toHaveBeenCalledWith(
      applicationId,
      userId,
    );
    expect(documentsService.findOwnedOrThrow).toHaveBeenCalledWith(
      document.id,
      userId,
    );
  });

  it('rejects when the application is not owned by the caller, without writing anything', async () => {
    applicationsService.findOwnedOrThrow.mockRejectedValueOnce(
      new Error('not your application'),
    );

    await expect(
      service.attach(userId, applicationId, { documentId: 'document-1' }),
    ).rejects.toThrow('not your application');
    expect(applicationDocuments.save).not.toHaveBeenCalled();
  });

  it('rejects when the document is not owned by the caller, even though the application is theirs', async () => {
    documentsService.findOwnedOrThrow.mockRejectedValueOnce(
      new Error('not your document'),
    );

    await expect(
      service.attach(userId, applicationId, {
        documentId: 'someone-elses-document',
      }),
    ).rejects.toThrow('not your document');
    expect(applicationDocuments.save).not.toHaveBeenCalled();
  });

  it('translates a duplicate-attachment unique violation into ConflictException', async () => {
    const driverError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'UQ_7f837e4e352186f29746f428de4',
    });
    applicationDocuments.save.mockRejectedValueOnce(
      new QueryFailedError(
        'INSERT INTO "application_documents" ...',
        undefined,
        driverError,
      ),
    );

    await expect(
      service.attach(userId, applicationId, { documentId: 'document-1' }),
    ).rejects.toThrow(ConflictException);
  });

  it('does not swallow a unique violation on a different constraint', async () => {
    const driverError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'some_other_constraint_entirely',
    });
    const unrelatedViolation = new QueryFailedError(
      'INSERT INTO "application_documents" ...',
      undefined,
      driverError,
    );
    applicationDocuments.save.mockRejectedValueOnce(unrelatedViolation);

    await expect(
      service.attach(userId, applicationId, { documentId: 'document-1' }),
    ).rejects.toThrow(unrelatedViolation);
  });

  it('findAllForApplication rejects when the application is not owned by the caller', async () => {
    applicationsService.findOwnedOrThrow.mockRejectedValueOnce(
      new Error('not your application'),
    );

    await expect(
      service.findAllForApplication(userId, applicationId),
    ).rejects.toThrow('not your application');
    expect(applicationDocuments.find).not.toHaveBeenCalled();
  });

  it('findAllForApplication returns the attached documents with their exact pinned version, via one joined query', async () => {
    const cvV2 = makeDocument({ id: 'document-cv-v2', version: 2 });
    documentsService.findOwnedOrThrow.mockResolvedValueOnce(cvV2);
    await service.attach(userId, applicationId, {
      documentId: cvV2.id,
      label: 'Primary CV',
    });

    const results = await service.findAllForApplication(userId, applicationId);

    expect(results).toHaveLength(1);
    expect(results[0].document.version).toBe(2);
    expect(results[0].document.cloudinaryUrl).toBe(cvV2.cloudinaryUrl);
    // Confirms the relation is loaded via one JOIN, not a per-row lookup.
    expect(applicationDocuments.find).toHaveBeenCalledWith(
      expect.objectContaining({ relations: { document: true } }),
    );
  });

  it('allows multiple different document versions to coexist on one application (no same-type restriction)', async () => {
    const cvV1 = makeDocument({ id: 'document-cv-v1', version: 1 });
    const cvV2 = makeDocument({ id: 'document-cv-v2', version: 2 });

    documentsService.findOwnedOrThrow.mockResolvedValueOnce(cvV1);
    await service.attach(userId, applicationId, {
      documentId: cvV1.id,
      label: 'Original CV',
    });
    documentsService.findOwnedOrThrow.mockResolvedValueOnce(cvV2);
    await service.attach(userId, applicationId, {
      documentId: cvV2.id,
      label: 'Updated CV',
    });

    const results = await service.findAllForApplication(userId, applicationId);
    expect(results.map((r) => r.document.version).sort()).toEqual([1, 2]);
  });

  it('stores the exact document version supplied, not whichever is currently "isCurrent"', async () => {
    // CV v2, explicitly no longer the current version — attaching it must
    // still pin exactly v2, not silently redirect to whatever is current.
    const cvV2NotCurrent = makeDocument({
      id: 'document-cv-v2',
      version: 2,
      isCurrent: false,
    });
    documentsService.findOwnedOrThrow.mockResolvedValueOnce(cvV2NotCurrent);

    const link = await service.attach(userId, applicationId, {
      documentId: cvV2NotCurrent.id,
    });

    expect(link.documentId).toBe('document-cv-v2');
    expect(link.document.version).toBe(2);
  });

  /**
   * Track 1 Group D (D-P4) — detach removes only the join row. Never the
   * underlying Document, never Cloudinary, never a Snapshot (snapshots don't
   * even exist in this service's dependency graph — the guarantee that
   * detach can't affect one is structural, not just behavioral; see
   * application-snapshots.historical-integrity.spec.ts test 8 for the
   * cross-service proof).
   */
  describe('detach', () => {
    it('removes the attachment, leaving the application with no attached documents', async () => {
      const document = makeDocument();
      documentsService.findOwnedOrThrow.mockResolvedValueOnce(document);
      await service.attach(userId, applicationId, { documentId: document.id });

      await service.detach(userId, applicationId, document.id);

      const remaining = await service.findAllForApplication(
        userId,
        applicationId,
      );
      expect(remaining).toHaveLength(0);
    });

    it('rejects detaching when the application is not owned by the caller, without touching any row', async () => {
      applicationsService.findOwnedOrThrow.mockRejectedValueOnce(
        new Error('not your application'),
      );

      await expect(
        service.detach(userId, applicationId, 'document-1'),
      ).rejects.toThrow('not your application');
      expect(applicationDocuments.delete).not.toHaveBeenCalled();
    });

    it('404s when no attachment exists for that (applicationId, documentId) pair', async () => {
      await expect(
        service.detach(userId, applicationId, 'never-attached-document'),
      ).rejects.toThrow(NotFoundException);
      expect(applicationDocuments.delete).not.toHaveBeenCalled();
    });

    it('404s for an attachment that belongs to a DIFFERENT application, even one owned by the same caller', async () => {
      const document = makeDocument();
      documentsService.findOwnedOrThrow.mockResolvedValueOnce(document);
      await service.attach(userId, applicationId, { documentId: document.id });

      await expect(
        service.detach(userId, 'a-different-application', document.id),
      ).rejects.toThrow(NotFoundException);
      // The original attachment (under `applicationId`) must survive.
      expect(
        await service.findAllForApplication(userId, applicationId),
      ).toHaveLength(1);
    });

    it('does not delete or otherwise call into the underlying Document', async () => {
      const document = makeDocument();
      documentsService.findOwnedOrThrow.mockResolvedValueOnce(document);
      await service.attach(userId, applicationId, { documentId: document.id });
      documentsService.findOwnedOrThrow.mockClear();

      await service.detach(userId, applicationId, document.id);

      expect(documentsService.findOwnedOrThrow).not.toHaveBeenCalled();
    });

    it('removes only the targeted attachment, leaving a different attachment on the same application intact', async () => {
      const cvV1 = makeDocument({ id: 'document-cv-v1', version: 1 });
      const cvV2 = makeDocument({ id: 'document-cv-v2', version: 2 });
      documentsService.findOwnedOrThrow.mockResolvedValueOnce(cvV1);
      await service.attach(userId, applicationId, { documentId: cvV1.id });
      documentsService.findOwnedOrThrow.mockResolvedValueOnce(cvV2);
      await service.attach(userId, applicationId, { documentId: cvV2.id });

      await service.detach(userId, applicationId, cvV1.id);

      const remaining = await service.findAllForApplication(
        userId,
        applicationId,
      );
      expect(remaining).toHaveLength(1);
      expect(remaining[0].documentId).toBe(cvV2.id);
    });
  });
});
