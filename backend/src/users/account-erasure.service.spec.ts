import { AccountErasureService } from './account-erasure.service';
import { ApplicationJourney } from '../journeys/entities/application-journey.entity';
import { Document } from '../documents/entities/document.entity';
import { User } from './entities/user.entity';

/**
 * Production hardening (Batch 7) — covers the deletion-order guarantee
 * (journeys before documents, documents in version-DESC order, user last —
 * see account-erasure.service.ts's doc comment for why each step must
 * happen in this order) and the Cloudinary cleanup that happens only after
 * the database transaction commits.
 */
describe('AccountErasureService', () => {
  const userId = 'user-1';

  const makeUsersRepo = (calls: { entity: string; arg: unknown }[]) => ({
    manager: {
      find: jest.fn(async (_entity: unknown, options: any) => {
        // Simulates `manager.find(Document, { where: { ownerId }, order: { version: 'DESC' } })`.
        const all = [
          {
            id: 'doc-v1',
            ownerId: userId,
            version: 1,
            cloudinaryPublicId: 'public-id-v1',
            cloudinaryResourceType: 'raw',
            mimeType: 'application/pdf',
          },
          {
            id: 'doc-v2',
            ownerId: userId,
            version: 2,
            cloudinaryPublicId: 'public-id-v2',
            cloudinaryResourceType: 'raw',
            mimeType: 'application/pdf',
          },
          {
            id: 'doc-image',
            ownerId: userId,
            version: 1,
            cloudinaryPublicId: 'public-id-image',
            cloudinaryResourceType: null,
            mimeType: 'image/png',
          },
        ];
        return all
          .filter((d) => d.ownerId === options.where.ownerId)
          .sort((a, b) => b.version - a.version);
      }),
      delete: jest.fn(async (entity: unknown, arg: unknown) => {
        const name =
          entity === ApplicationJourney
            ? 'ApplicationJourney'
            : entity === Document
              ? 'Document'
              : entity === User
                ? 'User'
                : 'unknown';
        calls.push({ entity: name, arg });
      }),
    },
  });

  // Wires manager.transaction's callback to the SAME manager object so
  // find/delete calls inside the transaction are visible to assertions.
  const setup = () => {
    const calls: { entity: string; arg: unknown }[] = [];
    const repo: any = makeUsersRepo(calls);
    repo.manager.transaction = jest.fn(async (callback: any) =>
      callback(repo.manager),
    );
    return { repo, calls };
  };

  it('deletes journeys before documents, and documents in version-DESC order, user last', async () => {
    const { repo, calls } = setup();
    const cloudinaryService = { deleteByPublicId: jest.fn(async () => {}) };
    const service = new AccountErasureService(
      repo,
      {} as any,
      {} as any,
      cloudinaryService as any,
    );

    await service.eraseAccount(userId);

    expect(calls.map((c) => c.entity)).toEqual([
      'ApplicationJourney',
      'Document', // doc-v2 (version 2, highest)
      'Document', // doc-image or doc-v1 (both version 1) — order among ties doesn't matter
      'Document',
      'User',
    ]);
    // The first Document deleted is the highest version.
    expect(calls[1].arg).toBe('doc-v2');
    // ApplicationJourney is scoped by userId, and User is deleted by id —
    // both correct WHERE targets.
    expect(calls[0].arg).toEqual({ userId });
    expect(calls[calls.length - 1].arg).toBe(userId);
  });

  it('deletes every owned document from Cloudinary only after the DB transaction commits', async () => {
    const { repo } = setup();
    const cloudinaryService = { deleteByPublicId: jest.fn(async () => {}) };
    const service = new AccountErasureService(
      repo,
      {} as any,
      {} as any,
      cloudinaryService as any,
    );

    await service.eraseAccount(userId);

    expect(cloudinaryService.deleteByPublicId).toHaveBeenCalledTimes(3);
    expect(cloudinaryService.deleteByPublicId).toHaveBeenCalledWith(
      'public-id-v1',
      'raw',
    );
    expect(cloudinaryService.deleteByPublicId).toHaveBeenCalledWith(
      'public-id-v2',
      'raw',
    );
    // Pre-migration row (cloudinaryResourceType: null) falls back to
    // inferring from mimeType.
    expect(cloudinaryService.deleteByPublicId).toHaveBeenCalledWith(
      'public-id-image',
      'image',
    );
  });

  it('a Cloudinary failure for one document does not stop cleanup of the others', async () => {
    const { repo } = setup();
    const cloudinaryService = {
      deleteByPublicId: jest
        .fn()
        .mockRejectedValueOnce(new Error('Cloudinary unreachable'))
        .mockResolvedValue(undefined),
    };
    const service = new AccountErasureService(
      repo,
      {} as any,
      {} as any,
      cloudinaryService as any,
    );

    await expect(service.eraseAccount(userId)).resolves.toBeUndefined();
    expect(cloudinaryService.deleteByPublicId).toHaveBeenCalledTimes(3);
  });

  it('does nothing Cloudinary-side for a user who owns no documents', async () => {
    const calls: { entity: string; arg: unknown }[] = [];
    const repo: any = makeUsersRepo(calls);
    repo.manager.find = jest.fn(async () => []);
    repo.manager.transaction = jest.fn(async (callback: any) =>
      callback(repo.manager),
    );
    const cloudinaryService = { deleteByPublicId: jest.fn(async () => {}) };
    const service = new AccountErasureService(
      repo,
      {} as any,
      {} as any,
      cloudinaryService as any,
    );

    await service.eraseAccount('user-with-no-documents');

    expect(cloudinaryService.deleteByPublicId).not.toHaveBeenCalled();
    // Journey deletion and User deletion still happen even with no documents.
    expect(calls.map((c) => c.entity)).toEqual(['ApplicationJourney', 'User']);
  });
});
