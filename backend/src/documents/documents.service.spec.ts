import { ConflictException, NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { DocumentType } from '../types';
import { DocumentsService } from './documents.service';

/**
 * Covers the guarantee documented on Document (see document.entity.ts):
 * uploading a new version creates a NEW row and never mutates a previous one.
 * This is what lets a historical ApplicationDocument keep pointing at the
 * exact version that was actually used for a given application, even after
 * the user's "current" document moves on to a later version — see
 * phase-1o5.txt §14 ("Document Versioning Validation").
 *
 * Also covers Track 1 Group D: the concurrent-version race fix, version
 * deletion eligibility (attached / snapshot-referenced / has a dependent
 * child), current-version promotion on deletion, and the Cloudinary
 * delete-ordering fix.
 */
describe('DocumentsService', () => {
  const ownerId = 'user-1';

  let documents: any;
  let applicationDocuments: any;
  let cloudinaryService: any;
  let service: DocumentsService;

  // Test-only knob: documentIds considered referenced by an existing
  // snapshot, consulted by the fake manager.query()'s "SELECT EXISTS ..."
  // branch — mirrors what isReferencedInAnySnapshot() actually queries for.
  let snapshotReferencedDocumentIds: Set<string>;

  const fakeFile = (name = 'file.pdf'): Express.Multer.File =>
    ({
      buffer: Buffer.from('fake-file-contents'),
      originalname: name,
      mimetype: 'application/pdf',
      size: 1024,
    }) as Express.Multer.File;

  beforeEach(() => {
    const rows = new Map<string, any>();
    let nextId = 1;
    let nextCloudinaryId = 1;
    snapshotReferencedDocumentIds = new Set();

    const matches = (row: any, where: Record<string, unknown>) =>
      Object.entries(where).every(([key, value]) => {
        if (value instanceof FindOperator && value.type === 'in') {
          return (value.value as string[]).includes(row[key]);
        }
        return row[key] === value;
      });

    // The scoped manager handed to every `manager.transaction(cb)` callback —
    // shared factory so both uploadNewVersion() (createQueryBuilder + lock)
    // and remove() (delete + update) get a consistent, realistic mock.
    //
    // Every write (update/delete/save) is STAGED, not applied immediately —
    // mirroring real Postgres transaction semantics, where nothing another
    // query can observe until COMMIT. The staged writes are only applied to
    // `rows` after the callback's promise resolves successfully; if it
    // rejects, `manager.transaction()` never applies them at all — a faithful
    // simulation of ROLLBACK undoing every statement in the transaction
    // together, not just whichever one happened to throw.
    const makeScopedManager = (staged: Array<() => void>) => ({
      update: jest.fn(async (_entityClass: any, id: string, partial: any) => {
        staged.push(() => {
          const row = rows.get(id);
          if (row) Object.assign(row, partial);
        });
      }),
      delete: jest.fn(async (_entityClass: any, id: string) => {
        staged.push(() => {
          rows.delete(id);
        });
      }),
      create: jest.fn((_entityClass: any, partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => {
        if (documents.manager.__failNextTransactionSave) {
          throw new Error('simulated transaction failure');
        }
        const withId = { id: row.id ?? `doc-${nextId++}`, ...row };
        staged.push(() => {
          rows.set(withId.id, withId);
        });
        return withId;
      }),
      // Simulates `createQueryBuilder(Document, alias).setLock(...).where(...).getOne()`.
      // Since this mock is single-threaded (no real concurrent transactions),
      // "locking" simply means: reads whatever is currently COMMITTED in
      // `rows` at the moment of the call — which is exactly what a real
      // `SELECT ... FOR UPDATE` returns once it acquires the lock (the
      // latest committed state), letting a sequential-call test faithfully
      // exercise the same logic a real race would hit. This always runs
      // before any staged write in the same transaction, so read-your-own-
      // writes ordering is never actually exercised here — matching how
      // uploadNewVersion() only ever reads once, up front.
      createQueryBuilder: jest.fn(() => {
        let targetId: string | undefined;
        const builder: {
          setLock: jest.Mock;
          where: jest.Mock;
          getOne: jest.Mock;
        } = {
          setLock: jest.fn(() => builder),
          where: jest.fn((_condition: string, params: { id: string }) => {
            targetId = params.id;
            return builder;
          }),
          getOne: jest.fn(async () =>
            targetId ? (rows.get(targetId) ?? null) : null,
          ),
        };
        return builder;
      }),
    });

    // Separate from the scoped-manager's createQueryBuilder above (used only
    // inside a transaction, for the row-lock) — this is the top-level
    // repository's own createQueryBuilder(), used by findAllCurrentForUser()'s
    // keyset pagination (.andWhere().orderBy().addOrderBy().take().getMany()).
    const makeListQueryBuilder = () => {
      const whereParams: Record<string, unknown> = {};
      let limit = Infinity;
      const builder: any = {
        andWhere: jest.fn((_sql: string, params: any) => {
          Object.assign(whereParams, params);
          return builder;
        }),
        orderBy: jest.fn(() => builder),
        addOrderBy: jest.fn(() => builder),
        take: jest.fn((n: number) => {
          limit = n;
          return builder;
        }),
        getMany: jest.fn(async () => {
          let result = [...rows.values()].filter(
            (r) => r.ownerId === whereParams.ownerId && r.isCurrent === true,
          );
          result.sort(
            (a, b) =>
              b.createdAt.getTime() - a.createdAt.getTime() ||
              b.id.localeCompare(a.id),
          );
          if (whereParams.cursorSortValue !== undefined) {
            const cursorTime = new Date(
              whereParams.cursorSortValue as string,
            ).getTime();
            result = result.filter(
              (r) =>
                r.createdAt.getTime() < cursorTime ||
                (r.createdAt.getTime() === cursorTime &&
                  r.id < (whereParams.cursorId as string)),
            );
          }
          return result.slice(0, limit);
        }),
      };
      return builder;
    };

    documents = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => {
        const withId = {
          id: row.id ?? `doc-${nextId++}`,
          createdAt: row.createdAt ?? new Date(),
          ...row,
        };
        rows.set(withId.id, withId);
        return withId;
      }),
      findOne: jest.fn(async ({ where }: any) => {
        return [...rows.values()].find((row) => matches(row, where)) ?? null;
      }),
      createQueryBuilder: jest.fn(() => makeListQueryBuilder()),
      find: jest.fn(async ({ where }: any) => {
        return [...rows.values()].filter((row) => matches(row, where));
      }),
      manager: {
        query: jest.fn(async (sql: string, params: unknown[]) => {
          if (sql.includes('WITH RECURSIVE')) {
            const [startId] = params as [string];
            const chain: { id: string }[] = [];
            let cursor = rows.get(startId);
            while (cursor) {
              chain.push({ id: cursor.id });
              cursor = cursor.previousVersionId
                ? rows.get(cursor.previousVersionId)
                : undefined;
            }
            return chain;
          }
          if (sql.includes('application_snapshots')) {
            const [, documentIdJson] = params as [string, string];
            const documentId = JSON.parse(documentIdJson)[0].documentId;
            return [{ exists: snapshotReferencedDocumentIds.has(documentId) }];
          }
          throw new Error(`Unexpected query in test: ${sql}`);
        }),
        __failNextTransactionSave: false,
        transaction: jest.fn(async (callback: any) => {
          const staged: Array<() => void> = [];
          const result = await callback(makeScopedManager(staged));
          // COMMIT: only now do the staged writes become visible.
          staged.forEach((apply) => apply());
          return result;
        }),
      },
    };

    applicationDocuments = { findOne: jest.fn(async () => null) };

    cloudinaryService = {
      uploadBuffer: jest.fn(async () => ({
        publicId: `cloudinary-public-id-${nextCloudinaryId++}`,
        secureUrl: 'https://res.cloudinary.invalid/fake.pdf',
        bytes: 1024,
        format: 'pdf',
        resourceType: 'raw',
      })),
      deleteByPublicId: jest.fn(),
      getSignedDeliveryUrl: jest.fn(
        (publicId: string, resourceType: string) =>
          `https://res.cloudinary.invalid/${resourceType}/authenticated/${publicId}?signed=1`,
      ),
    };

    service = new DocumentsService(
      documents,
      applicationDocuments,
      cloudinaryService,
      {
        get: jest.fn((key: string) => {
          if (key === 'documents') {
            return { signedUrlTtlSeconds: 300 };
          }
          return { defaultPageSize: 25, maxPageSize: 100 };
        }),
      } as any,
    );
  });

  describe('version history integrity', () => {
    it('creates version 1 with no previous version on first upload', async () => {
      const v1 = await service.uploadNew(
        ownerId,
        { title: 'CV', documentType: DocumentType.CV },
        fakeFile(),
      );

      expect(v1.version).toBe(1);
      expect(v1.previousVersionId).toBeNull();
      expect(v1.isCurrent).toBe(true);
    });

    it('uploading a new version creates a new row and marks the previous one not-current without altering it', async () => {
      const v1 = await service.uploadNew(
        ownerId,
        { title: 'CV', documentType: DocumentType.CV },
        fakeFile('cv-v1.pdf'),
      );
      const originalPublicId = v1.cloudinaryPublicId;
      const originalTitle = v1.title;

      const v2 = await service.uploadNewVersion(
        ownerId,
        v1.id,
        fakeFile('cv-v2.pdf'),
        {},
      );

      expect(v2.id).not.toBe(v1.id);
      expect(v2.version).toBe(2);
      expect(v2.previousVersionId).toBe(v1.id);
      expect(v2.isCurrent).toBe(true);

      const reloadedV1 = await documents.findOne({ where: { id: v1.id } });
      expect(reloadedV1.isCurrent).toBe(false);
      expect(reloadedV1.cloudinaryPublicId).toBe(originalPublicId);
      expect(reloadedV1.title).toBe(originalTitle);
      expect(reloadedV1.version).toBe(1);
    });

    it('findAllCurrentForUser returns only the current version, never a superseded one', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());
      await service.uploadNewVersion(ownerId, v1.id, fakeFile(), {});

      const current = await service.findAllCurrentForUser(ownerId, {});

      expect(current.items).toHaveLength(1);
      expect(current.items[0].version).toBe(2);
    });

    it('findVersionHistory returns the full chain oldest-first', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());
      const v2 = await service.uploadNewVersion(ownerId, v1.id, fakeFile(), {});
      const v3 = await service.uploadNewVersion(ownerId, v2.id, fakeFile(), {});

      const history = await service.findVersionHistory(ownerId, v3.id);

      expect(history.map((doc) => doc.version)).toEqual([1, 2, 3]);
      expect(history[0].id).toBe(v1.id);
      expect(history[1].id).toBe(v2.id);
      expect(history[2].id).toBe(v3.id);
    });

    it('historical references to earlier versions remain intact after later versions are created (spec §14 scenario)', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());
      const applicationDocumentForA = { documentId: v1.id };

      const v2 = await service.uploadNewVersion(ownerId, v1.id, fakeFile(), {});
      const applicationDocumentForB = { documentId: v2.id };

      const v3 = await service.uploadNewVersion(ownerId, v2.id, fakeFile(), {});

      expect(applicationDocumentForA.documentId).toBe(v1.id);
      expect(applicationDocumentForB.documentId).toBe(v2.id);

      const reloadedV1 = await documents.findOne({ where: { id: v1.id } });
      const reloadedV2 = await documents.findOne({ where: { id: v2.id } });
      expect(reloadedV1.isCurrent).toBe(false);
      expect(reloadedV2.isCurrent).toBe(false);
      expect(v3.isCurrent).toBe(true);
      expect(v3.version).toBe(3);

      expect(
        (
          await documents.findOne({
            where: { id: applicationDocumentForA.documentId },
          })
        ).version,
      ).toBe(1);
      expect(
        (
          await documents.findOne({
            where: { id: applicationDocumentForB.documentId },
          })
        ).version,
      ).toBe(2);
    });

    it('rejects uploading a new version onto a document owned by a different user, as a 404 (Track 1 Group E)', async () => {
      const v1 = await service.uploadNew(
        'owner-a',
        { title: 'CV' },
        fakeFile(),
      );

      // A foreign-owned document must respond exactly like one that doesn't
      // exist — NotFoundException (404), not ForbiddenException (403). See
      // common/utils/ownership.ts's doc comment.
      await expect(
        service.uploadNewVersion('owner-b', v1.id, fakeFile(), {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('a genuinely nonexistent document 404s identically to a foreign-owned one (Track 1 Group E)', async () => {
      await expect(
        service.uploadNewVersion(
          ownerId,
          'document-does-not-exist',
          fakeFile(),
          {},
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('uploadNewVersion produces the same end state as before now that it runs inside a transaction', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());
      const v2 = await service.uploadNewVersion(ownerId, v1.id, fakeFile(), {});

      const reloadedV1 = await documents.findOne({ where: { id: v1.id } });
      expect(reloadedV1.isCurrent).toBe(false);
      expect(v2.isCurrent).toBe(true);
      expect(v2.previousVersionId).toBe(v1.id);
      expect(documents.manager.transaction).toHaveBeenCalledTimes(1);
    });

    it('rolls back: if the new-version write fails, the previous version is NOT left marked not-current', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());

      documents.manager.__failNextTransactionSave = true;
      await expect(
        service.uploadNewVersion(ownerId, v1.id, fakeFile(), {}),
      ).rejects.toThrow('simulated transaction failure');

      const reloadedV1 = await documents.findOne({ where: { id: v1.id } });
      expect(reloadedV1.isCurrent).toBe(true);

      const allDocs = await documents.find({ where: { ownerId } });
      expect(allDocs).toHaveLength(1);
    });
  });

  /**
   * Track 1 Group D / D1 — the concurrent-version race fix. True thread-level
   * concurrency isn't reproducible in a single-threaded Jest mock, so instead
   * this exercises the actual protection mechanism directly: a second
   * `uploadNewVersion()` call targeting a parent id that has ALREADY been
   * superseded (exactly the state the loser of a real race would observe
   * once it acquires the row lock the winner just released) must be
   * rejected, not silently allowed to create a duplicate-numbered sibling.
   * This is the realistic, deterministic way to prove the fix — not an
   * attempt to fake true thread interleaving.
   */
  describe('concurrent version-creation protection (D1)', () => {
    it('rejects a second uploadNewVersion() call against a parent that has already been superseded', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());
      await service.uploadNewVersion(ownerId, v1.id, fakeFile(), {}); // "winner" — v1 -> v2

      // "loser" — still targeting v1, which is no longer current.
      await expect(
        service.uploadNewVersion(ownerId, v1.id, fakeFile(), {}),
      ).rejects.toThrow(ConflictException);
    });

    it('after a rejected second call, exactly one row is current and no duplicate version number exists', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());
      await service.uploadNewVersion(ownerId, v1.id, fakeFile(), {});

      await expect(
        service.uploadNewVersion(ownerId, v1.id, fakeFile(), {}),
      ).rejects.toThrow(ConflictException);

      const all = await documents.find({ where: { ownerId } });
      const current = all.filter((d: any) => d.isCurrent);
      const versionNumbers = all.map((d: any) => d.version);

      expect(current).toHaveLength(1);
      expect(new Set(versionNumbers).size).toBe(versionNumbers.length);
    });

    it('a version chain still works correctly after a rejected concurrent attempt', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());
      const v2 = await service.uploadNewVersion(ownerId, v1.id, fakeFile(), {});

      await expect(
        service.uploadNewVersion(ownerId, v1.id, fakeFile(), {}),
      ).rejects.toThrow(ConflictException);

      // The legitimate winner's chain is untouched by the rejected attempt.
      const v3 = await service.uploadNewVersion(ownerId, v2.id, fakeFile(), {});
      expect(v3.version).toBe(3);
      expect(v3.previousVersionId).toBe(v2.id);
    });
  });

  /** Track 1 Group D / D-P1, D-P2, D-P3 — version deletion eligibility. */
  describe('remove() — deletion eligibility', () => {
    it('deletes an unattached, non-referenced, non-current, childless version cleanly', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());
      // v1 is unattached, not referenced by any snapshot, and (since it's
      // the only version) has no dependent child — freely deletable.
      await service.remove(v1.id, ownerId);

      expect(await documents.findOne({ where: { id: v1.id } })).toBeNull();
      expect(cloudinaryService.deleteByPublicId).toHaveBeenCalledWith(
        v1.cloudinaryPublicId,
        'raw',
      );
    });

    it('rejects deleting a version that is currently attached to an application', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());
      applicationDocuments.findOne = jest.fn(async () => ({
        id: 'application-document-1',
        documentId: v1.id,
      }));

      await expect(service.remove(v1.id, ownerId)).rejects.toThrow(
        ConflictException,
      );
      expect(cloudinaryService.deleteByPublicId).not.toHaveBeenCalled();
      // The row must still exist — rejection happened before any delete.
      expect(await documents.findOne({ where: { id: v1.id } })).not.toBeNull();
    });

    it('rejects deleting a version that is referenced by an existing application snapshot, even though it is not currently attached', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());
      snapshotReferencedDocumentIds.add(v1.id);

      await expect(service.remove(v1.id, ownerId)).rejects.toThrow(
        ConflictException,
      );
      expect(cloudinaryService.deleteByPublicId).not.toHaveBeenCalled();
      expect(await documents.findOne({ where: { id: v1.id } })).not.toBeNull();
    });

    it('rejects deleting a middle version that a newer version still depends on', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());
      await service.uploadNewVersion(ownerId, v1.id, fakeFile(), {}); // v2 depends on v1

      await expect(service.remove(v1.id, ownerId)).rejects.toThrow(
        ConflictException,
      );
      expect(cloudinaryService.deleteByPublicId).not.toHaveBeenCalled();
      expect(await documents.findOne({ where: { id: v1.id } })).not.toBeNull();
    });

    it('deleting the current version promotes the previous version to current', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());
      const v2 = await service.uploadNewVersion(ownerId, v1.id, fakeFile(), {});
      // v2 is current; nothing points to v2 via previousVersionId, so it has
      // no dependent child and is freely deletable.

      await service.remove(v2.id, ownerId);

      const reloadedV1 = await documents.findOne({ where: { id: v1.id } });
      expect(reloadedV1.isCurrent).toBe(true);
      expect(await documents.findOne({ where: { id: v2.id } })).toBeNull();

      const current = await service.findAllCurrentForUser(ownerId, {});
      expect(current.items).toHaveLength(1);
      expect(current.items[0].id).toBe(v1.id);
    });

    it('deleting the sole version of a document family removes it entirely, with no misleading empty-current state', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());

      await service.remove(v1.id, ownerId);

      const current = await service.findAllCurrentForUser(ownerId, {});
      expect(current.items).toHaveLength(0);
      expect(await documents.findOne({ where: { id: v1.id } })).toBeNull();
    });

    it('rejects deletion for a document owned by a different user, as a 404 (Track 1 Group E)', async () => {
      const v1 = await service.uploadNew(
        'owner-a',
        { title: 'CV' },
        fakeFile(),
      );

      await expect(service.remove(v1.id, 'owner-b')).rejects.toThrow(
        NotFoundException,
      );
      expect(cloudinaryService.deleteByPublicId).not.toHaveBeenCalled();
    });
  });

  /** Track 1 Group D / D-P7 — Cloudinary deletion ordering. */
  describe('remove() — Cloudinary lifecycle ordering (D-P7)', () => {
    it('rejects an attached document before ever calling Cloudinary (Test 1 / Test 2)', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());
      applicationDocuments.findOne = jest.fn(async () => ({
        id: 'application-document-1',
        documentId: v1.id,
      }));

      await expect(service.remove(v1.id, ownerId)).rejects.toThrow(
        ConflictException,
      );
      expect(cloudinaryService.deleteByPublicId).not.toHaveBeenCalled();
    });

    it('attempts Cloudinary deletion only after the DB deletion succeeds (Test 3)', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());

      await service.remove(v1.id, ownerId);

      expect(await documents.findOne({ where: { id: v1.id } })).toBeNull();
      expect(cloudinaryService.deleteByPublicId).toHaveBeenCalledTimes(1);
      expect(cloudinaryService.deleteByPublicId).toHaveBeenCalledWith(
        v1.cloudinaryPublicId,
        'raw',
      );
    });

    it('a Cloudinary failure after a successful DB deletion does not recreate or corrupt the DB row (Test 4)', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());
      cloudinaryService.deleteByPublicId.mockRejectedValueOnce(
        new Error('Cloudinary is unreachable'),
      );

      // remove() must not itself reject — the DB deletion already
      // succeeded and committed; a Cloudinary-side failure afterward is
      // logged, not surfaced as an overall failure of the operation.
      await expect(service.remove(v1.id, ownerId)).resolves.toBeUndefined();

      // The row stays deleted — nothing re-inserts it to "compensate".
      expect(await documents.findOne({ where: { id: v1.id } })).toBeNull();
    });

    it('never calls Cloudinary at all when an eligibility check rejects the deletion', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());
      await service.uploadNewVersion(ownerId, v1.id, fakeFile(), {}); // gives v1 a dependent child

      await expect(service.remove(v1.id, ownerId)).rejects.toThrow(
        ConflictException,
      );
      expect(cloudinaryService.deleteByPublicId).not.toHaveBeenCalled();
    });
  });

  /**
   * Production hardening (Batch 6) — compensating delete when the Cloudinary
   * upload succeeds but the DB write that was supposed to record it fails,
   * closing the orphan gap on the upload side (previously only the delete
   * side logged/cleaned up after itself).
   */
  describe('upload-then-persist failure — compensating Cloudinary delete', () => {
    it('uploadNew(): deletes the just-uploaded asset and rethrows the original DB error when save() fails', async () => {
      documents.save.mockRejectedValueOnce(new Error('DB write failed'));

      await expect(
        service.uploadNew(ownerId, { title: 'CV' }, fakeFile()),
      ).rejects.toThrow('DB write failed');

      expect(cloudinaryService.deleteByPublicId).toHaveBeenCalledTimes(1);
      expect(cloudinaryService.deleteByPublicId).toHaveBeenCalledWith(
        'cloudinary-public-id-1',
        'raw',
      );
      // No orphaned row was left behind either.
      expect(await documents.find({ where: {} })).toHaveLength(0);
    });

    it('uploadNewVersion(): deletes the just-uploaded asset and rethrows when the transaction rolls back on a DB error', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());
      documents.manager.transaction.mockRejectedValueOnce(
        new Error('transaction failed'),
      );

      await expect(
        service.uploadNewVersion(ownerId, v1.id, fakeFile(), {}),
      ).rejects.toThrow('transaction failed');

      expect(cloudinaryService.deleteByPublicId).toHaveBeenCalledWith(
        'cloudinary-public-id-2',
        'raw',
      );
    });

    it('uploadNewVersion(): also cleans up the newly-uploaded asset when rejected by the concurrent-version race check', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());
      await service.uploadNewVersion(ownerId, v1.id, fakeFile(), {}); // v1 is no longer current

      await expect(
        service.uploadNewVersion(ownerId, v1.id, fakeFile(), {}),
      ).rejects.toThrow(ConflictException);

      // The second call's own upload (publicId #3 — #1 is v1, #2 is the
      // legitimate v2) is the one that must be cleaned up; it was never
      // referenced by any Document row.
      expect(cloudinaryService.deleteByPublicId).toHaveBeenCalledWith(
        'cloudinary-public-id-3',
        'raw',
      );
    });

    it('logs, but does not throw the cleanup error, when the compensating delete itself also fails', async () => {
      documents.save.mockRejectedValueOnce(new Error('DB write failed'));
      cloudinaryService.deleteByPublicId.mockRejectedValueOnce(
        new Error('Cloudinary is unreachable'),
      );

      // The original DB error surfaces, not the cleanup failure.
      await expect(
        service.uploadNew(ownerId, { title: 'CV' }, fakeFile()),
      ).rejects.toThrow('DB write failed');
    });
  });

  /** Production hardening (Batch 6) — signed delivery URLs. */
  describe('getSignedDownloadUrl()', () => {
    it('returns a signed URL for the resource type Cloudinary reported at upload time, plus the configured TTL', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());

      const result = await service.getSignedDownloadUrl(v1.id, ownerId);

      expect(cloudinaryService.getSignedDeliveryUrl).toHaveBeenCalledWith(
        v1.cloudinaryPublicId,
        'raw',
      );
      expect(result.url).toContain(v1.cloudinaryPublicId);
      expect(result.expiresInSeconds).toBe(300);
    });

    it('rejects a document owned by a different user, as a 404', async () => {
      const v1 = await service.uploadNew(
        'owner-a',
        { title: 'CV' },
        fakeFile(),
      );

      await expect(
        service.getSignedDownloadUrl(v1.id, 'owner-b'),
      ).rejects.toThrow(NotFoundException);
      expect(cloudinaryService.getSignedDeliveryUrl).not.toHaveBeenCalled();
    });

    it('falls back to inferring the resource type from mimeType for a pre-migration row with no stored cloudinaryResourceType', async () => {
      const v1 = await service.uploadNew(ownerId, { title: 'CV' }, fakeFile());
      // Simulate a row written before the `cloudinaryResourceType` column
      // existed.
      const row = await documents.findOne({ where: { id: v1.id } });
      row.cloudinaryResourceType = null;
      row.mimeType = 'image/png';

      await service.getSignedDownloadUrl(v1.id, ownerId);

      expect(cloudinaryService.getSignedDeliveryUrl).toHaveBeenCalledWith(
        v1.cloudinaryPublicId,
        'image',
      );
    });
  });
});
