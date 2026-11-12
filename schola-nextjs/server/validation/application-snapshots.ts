import { z } from 'zod';

/**
 * Ported from `applications/dto/create-application-snapshot.dto.ts` +
 * `edit-application-snapshot.dto.ts`. Deliberately does NOT accept
 * `createdVia`/`applicationId`/lineage fields from the client — the service
 * always server-sets those (see `docs/decisions.md`, "Application Snapshot
 * creation model").
 */
export const createApplicationSnapshotSchema = z
  .object({
    label: z.string().max(255).optional(),
  })
  .strict();

export const editApplicationSnapshotSchema = z
  .object({
    label: z.string().max(255).nullable().optional(),
    /** Full replacement of the data blob. Omit to carry the previous revision's data forward unchanged. */
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type CreateApplicationSnapshotInput = z.infer<typeof createApplicationSnapshotSchema>;
export type EditApplicationSnapshotInput = z.infer<typeof editApplicationSnapshotSchema>;
