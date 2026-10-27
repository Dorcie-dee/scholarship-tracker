import { z } from 'zod';
import { FREE_TEXT_MAX_LENGTH } from '../lib/text-limits';

/**
 * Ported from the original NestJS backend's `UpdateProfileDto`. Deliberately
 * permissive on SHAPE — `education`/`experience`/`skills`/`certifications`/
 * `languages` are jsonb-equivalent (Mongoose `Mixed`) arrays (see
 * `server/models/applicant-profile.model.ts`'s doc comment), so this schema
 * only validates the outer shape (array, bounded element count) plus "each
 * element is a plain object" — slightly tighter than the original DTO
 * (`@IsArray()` alone, no per-item check), but matches what the model's own
 * type (`Record<string, unknown>[]`) already documents each element as,
 * and keeps `Object.assign()` in `profile.service.ts#updateProfile` from
 * ever writing a non-object into a field every consumer treats as a record
 * array. `metadata` stays an unbounded catch-all object, same reasoning as
 * the original DTO's comment: still covered by the global request body size
 * cap, not worth a bespoke JSON-size validator without a concrete case.
 */
export const updateProfileSchema = z
  .object({
    nationality: z.string().max(255).optional(),
    dateOfBirth: z.string().max(32).optional(),
    summary: z.string().max(FREE_TEXT_MAX_LENGTH).optional(),
    education: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
    experience: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
    skills: z.array(z.record(z.string(), z.unknown())).max(100).optional(),
    certifications: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
    languages: z.array(z.record(z.string(), z.unknown())).max(100).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
