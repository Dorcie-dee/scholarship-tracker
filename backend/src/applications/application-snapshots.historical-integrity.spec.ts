import { ApplicationStatus, ApplicationType } from '../types';
import { ApplicationSnapshotsService } from './application-snapshots.service';

/**
 * Checkpoint 9C — proves ApplicationSnapshot behaves as a genuine historical
 * record, not a pointer to "whatever things look like now."
 *
 * Deliberately separate from application-snapshots.service.spec.ts: that file
 * proves each method's ordinary behaviour (ownership enforcement, exact data
 * shape, ordinary retrieval) in isolation; this file proves the cross-call
 * guarantee — that a snapshot created from state A stays state A even after
 * the application/profile/requirement/document data it was built from
 * changes. Ownership/cross-application-rejection are NOT re-tested here —
 * already proven in application-snapshots.service.spec.ts; duplicating them
 * here would only re-assert the same thing, not new coverage.
 *
 * Same mocked-repository style as every other service spec in this codebase
 * (grepped — Test.createTestingModule is used nowhere except the untouched
 * Nest scaffold default, app.controller.spec.ts). No real database: the
 * property under test is that ApplicationSnapshotsService.create() copies
 * primitive values into a plain object once and never re-reads anything
 * afterward — fully observable with mocks, same as every other behavioural
 * guarantee already proven in this codebase.
 */
describe('ApplicationSnapshotsService — historical integrity', () => {
  const userId = 'user-1';
  const applicationIdA = 'application-a';
  const applicationIdB = 'application-b';

  let applicationSnapshots: any;
  let applicationDocuments: any;
  let requirements: any;
  let applicationsService: any;
  let profileService: any;
  let service: ApplicationSnapshotsService;

  const makeApplication = (overrides: Record<string, unknown> = {}) => ({
    id: applicationIdA,
    journeyId: 'journey-1',
    status: ApplicationStatus.IN_PROGRESS,
    applicationType: ApplicationType.ADMISSION,
    title: 'University of Twente — MSc Computer Science',
    startDate: '2026-01-01',
    submissionDate: null,
    portal: 'https://apply.utwente.nl',
    externalUrl: null,
    notes: 'Waiting on recommendation letter',
    ...overrides,
  });

  const makeProfile = (overrides: Record<string, unknown> = {}) => ({
    userId,
    nationality: 'Ghanaian',
    dateOfBirth: '2000-01-01',
    summary: 'Aspiring CS researcher',
    education: [{ degree: 'BSc Computer Science' }],
    experience: [{ role: 'Research Assistant' }],
    skills: ['TypeScript', 'Postgres'],
    certifications: [],
    languages: ['English'],
    metadata: { internalNote: 'not application-relevant' },
    ...overrides,
  });

  const makeRequirement = (overrides: Record<string, unknown> = {}) => ({
    id: 'requirement-1',
    requirementType: 'language',
    description: 'IELTS 6.5+',
    status: 'needs_verification',
    notes: 'Awaiting official score report',
    copiedFromRequirementId: null,
    ...overrides,
  });

  const makeAttachedDocument = (
    documentId: string,
    version: number,
    overrides: Record<string, unknown> = {},
  ) => ({
    documentId,
    label: 'Primary CV',
    document: { version },
    ...overrides,
  });

  beforeEach(() => {
    applicationSnapshots = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => ({
        id: `snapshot-${Math.random()}`,
        ...row,
      })),
    };
    applicationDocuments = { find: jest.fn(async () => []) };
    requirements = { find: jest.fn(async () => []) };
    applicationsService = {
      findOwnedOrThrow: jest.fn(async () => makeApplication()),
    };
    profileService = { getByUserId: jest.fn(async () => makeProfile()) };

    service = new ApplicationSnapshotsService(
      applicationSnapshots,
      applicationDocuments,
      requirements,
      applicationsService,
      profileService,
      {
        transaction: jest.fn(async (fn: any) =>
          fn({ getRepository: () => applicationSnapshots }),
        ),
      } as any,
    );
  });

  it('1. creation captures State A — baseline for every mutation test below', async () => {
    const stateAApplication = makeApplication({
      status: ApplicationStatus.IN_PROGRESS,
      title: 'State A title',
    });
    const stateAProfile = makeProfile({ summary: 'State A summary' });
    const stateARequirement = makeRequirement({ status: 'needs_verification' });
    const stateADocument = makeAttachedDocument('document-x', 2);

    applicationsService.findOwnedOrThrow.mockResolvedValueOnce(
      stateAApplication,
    );
    profileService.getByUserId.mockResolvedValueOnce(stateAProfile);
    requirements.find.mockResolvedValueOnce([stateARequirement]);
    applicationDocuments.find.mockResolvedValueOnce([stateADocument]);

    const snapshotA = await service.create(userId, applicationIdA, {});

    expect(snapshotA.data.application.status).toBe(
      ApplicationStatus.IN_PROGRESS,
    );
    expect(snapshotA.data.application.title).toBe('State A title');
    expect(snapshotA.data.profile.summary).toBe('State A summary');
    expect(snapshotA.data.requirements).toEqual([
      expect.objectContaining({ status: 'needs_verification' }),
    ]);
    expect(snapshotA.data.documents).toEqual([
      { documentId: 'document-x', version: 2 },
    ]);
  });

  it('2. application-mutation immunity — snapshot A keeps its stored application facts after the application changes', async () => {
    applicationsService.findOwnedOrThrow.mockResolvedValueOnce(
      makeApplication({
        status: ApplicationStatus.IN_PROGRESS,
        title: 'Before submitting',
      }),
    );
    const snapshotA = await service.create(userId, applicationIdA, {});

    // The application changes AFTER snapshot A was created.
    applicationsService.findOwnedOrThrow.mockResolvedValueOnce(
      makeApplication({
        status: ApplicationStatus.SUBMITTED,
        title: 'Submitted!',
      }),
    );
    const snapshotB = await service.create(userId, applicationIdA, {});

    // Assert directly against snapshot A's STORED data — not a comparison
    // between snapshot A and snapshot B — to make sure snapshot A's own
    // record genuinely never changed, independent of what snapshot B holds.
    expect(snapshotA.data.application.status).toBe(
      ApplicationStatus.IN_PROGRESS,
    );
    expect(snapshotA.data.application.title).toBe('Before submitting');

    expect(snapshotB.data.application.status).toBe(ApplicationStatus.SUBMITTED);
    expect(snapshotB.data.application.title).toBe('Submitted!');
  });

  it('3. profile-mutation immunity — snapshot A keeps its stored profile facts after the profile changes', async () => {
    profileService.getByUserId.mockResolvedValueOnce(
      makeProfile({ summary: 'Before update', skills: ['TypeScript'] }),
    );
    const snapshotA = await service.create(userId, applicationIdA, {});

    // The profile changes AFTER snapshot A was created.
    profileService.getByUserId.mockResolvedValueOnce(
      makeProfile({ summary: 'After update', skills: ['TypeScript', 'Rust'] }),
    );
    const snapshotB = await service.create(userId, applicationIdA, {});

    expect(snapshotA.data.profile.summary).toBe('Before update');
    expect(snapshotA.data.profile.skills).toEqual(['TypeScript']);

    expect(snapshotB.data.profile.summary).toBe('After update');
    expect(snapshotB.data.profile.skills).toEqual(['TypeScript', 'Rust']);
  });

  it('4. requirement-mutation immunity — snapshot A keeps its stored requirement facts after the requirement changes', async () => {
    requirements.find.mockResolvedValueOnce([
      makeRequirement({ status: 'needs_verification' }),
    ]);
    const snapshotA = await service.create(userId, applicationIdA, {});

    // The requirement's status changes AFTER snapshot A was created.
    requirements.find.mockResolvedValueOnce([
      makeRequirement({ status: 'confirmed' }),
    ]);
    const snapshotB = await service.create(userId, applicationIdA, {});

    expect(snapshotA.data.requirements).toEqual([
      expect.objectContaining({ status: 'needs_verification' }),
    ]);
    expect(snapshotB.data.requirements).toEqual([
      expect.objectContaining({ status: 'confirmed' }),
    ]);
  });

  it('5. document-version-bump immunity — snapshot A stays pinned to {documentId, version: 2} after Document X reaches v3', async () => {
    // Document X, version 2, attached to Application A.
    applicationDocuments.find.mockResolvedValueOnce([
      makeAttachedDocument('document-x', 2),
    ]);
    const snapshotA = await service.create(userId, applicationIdA, {});

    // Document X gets a newer version (v3) — same application, same
    // documentId, only the version changes, exactly as a real "upload a new
    // CV" would look.
    applicationDocuments.find.mockResolvedValueOnce([
      makeAttachedDocument('document-x', 3),
    ]);
    const snapshotB = await service.create(userId, applicationIdA, {});

    // The assertion is against snapshot A's STORED {documentId, version}
    // data specifically — not "snapshot A differs from snapshot B" — so a
    // regression that accidentally shared a reference to the live Document
    // row (rather than copying its version at creation time) would be caught
    // even if snapshot B happened to look right.
    expect(snapshotA.data.documents).toEqual([
      { documentId: 'document-x', version: 2 },
    ]);
    expect(snapshotB.data.documents).toEqual([
      { documentId: 'document-x', version: 3 },
    ]);

    // Re-assert snapshot A's stored value AFTER snapshot B was created, to
    // rule out any shared-object mutation between the two calls.
    expect(snapshotA.data.documents).toEqual([
      { documentId: 'document-x', version: 2 },
    ]);
  });

  it('6. cross-application document pinning — Document X stays {v2} for Application A even after it is attached at {v3} to Application B', async () => {
    // Document X, version 2, attached to Application A.
    applicationsService.findOwnedOrThrow.mockResolvedValueOnce(
      makeApplication({ id: applicationIdA }),
    );
    applicationDocuments.find.mockResolvedValueOnce([
      makeAttachedDocument('document-x', 2),
    ]);
    const snapshotA = await service.create(userId, applicationIdA, {});

    // The SAME Document X, now at version 3, attached to a DIFFERENT
    // application (Application B) — not a later version of Application A's
    // own attachment, a genuinely separate application.
    applicationsService.findOwnedOrThrow.mockResolvedValueOnce(
      makeApplication({ id: applicationIdB }),
    );
    applicationDocuments.find.mockResolvedValueOnce([
      makeAttachedDocument('document-x', 3),
    ]);
    const snapshotB = await service.create(userId, applicationIdB, {});

    // Both assertions are against each snapshot's own STORED data.documents
    // field, proving the historical record is per-snapshot, not a live
    // pointer to "whatever Document X currently looks like."
    expect(snapshotA.data.documents).toEqual([
      { documentId: 'document-x', version: 2 },
    ]);
    expect(snapshotB.data.documents).toEqual([
      { documentId: 'document-x', version: 3 },
    ]);
  });

  /**
   * Track 1 Group D (D-P6) — Group C requirement provenance
   * (copiedFromRequirementId) must behave exactly like every other captured
   * field: a plain point-in-time copy, immune to whatever happens to the
   * source Requirement — or even to this same Requirement row's own
   * `copiedFromRequirementId` column — afterward.
   */
  it('7. requirement-provenance immunity — snapshot A keeps its stored copiedFromRequirementId after the underlying column changes', async () => {
    requirements.find.mockResolvedValueOnce([
      makeRequirement({
        id: 'requirement-copy',
        copiedFromRequirementId: 'opportunity-requirement-source',
      }),
    ]);
    const snapshotA = await service.create(userId, applicationIdA, {});

    // Simulates the source Opportunity Requirement later being deleted —
    // `copiedFromRequirementId`'s `ON DELETE SET NULL` FK would null out the
    // COPY row's own column at that point, exactly like this second read.
    requirements.find.mockResolvedValueOnce([
      makeRequirement({
        id: 'requirement-copy',
        copiedFromRequirementId: null,
      }),
    ]);
    const snapshotB = await service.create(userId, applicationIdA, {});

    expect(snapshotA.data.requirements[0].copiedFromRequirementId).toBe(
      'opportunity-requirement-source',
    );
    expect(snapshotB.data.requirements[0].copiedFromRequirementId).toBeNull();

    // Re-assert A's stored value after B was created, ruling out any shared
    // reference between the two snapshots' data.
    expect(snapshotA.data.requirements[0].copiedFromRequirementId).toBe(
      'opportunity-requirement-source',
    );
  });

  /**
   * Track 1 Group D (D-P4/D6) — detaching an ApplicationDocument is a
   * working-state cleanup operation; it must never rewrite an existing
   * snapshot. This test simulates the detach by having the SECOND
   * `applicationDocuments.find()` call (the one a later snapshot would use)
   * return no attachments — exactly what a real detach would produce —
   * while asserting the FIRST snapshot's own stored data never changes.
   */
  it('8. ApplicationDocument-detach immunity — snapshot A keeps CV v1 after it is detached from the application', async () => {
    applicationDocuments.find.mockResolvedValueOnce([
      makeAttachedDocument('document-cv', 1),
    ]);
    const snapshotA = await service.create(userId, applicationIdA, {});

    // Detach happens (simulated: no attachments remain), then a second
    // snapshot is taken of the now-empty attachment state.
    applicationDocuments.find.mockResolvedValueOnce([]);
    const snapshotB = await service.create(userId, applicationIdA, {});

    expect(snapshotA.data.documents).toEqual([
      { documentId: 'document-cv', version: 1 },
    ]);
    expect(snapshotB.data.documents).toEqual([]);
  });
});
