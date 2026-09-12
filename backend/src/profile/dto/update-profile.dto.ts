import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { FREE_TEXT_MAX_LENGTH } from '../../common/validators/text-limits';

/**
 * Deliberately permissive on SHAPE: education/experience/skills/etc. are
 * jsonb arrays (see applicant-profile.entity.ts's doc comment) rather than
 * fully modeled DTOs per sub-field, so this DTO only validates the outer
 * shape. Consumers (frontend forms) are responsible for the inner shape of
 * each array item — that design decision is unchanged.
 *
 * Production hardening (Batch 8) — bounded on SIZE, which it previously
 * wasn't at all: `@ArrayMaxSize` caps element count per array, and the
 * scalar string fields below now carry the same `@MaxLength` bound every
 * other free-text field in this codebase has (see text-limits.ts). This
 * profile is the one place in the whole API where an ordinary authenticated
 * user (not just an ADMIN) can write an open-ended, itself-user-controlled
 * collection — every PATCH replaces the field outright (`ProfileService.
 * update()`'s `Object.assign`, not an append), so the per-request 256kb body
 * limit (Batch 1) already bounds any single write's total byte size, but a
 * request well under that limit can still carry a pathological item count
 * (e.g. tens of thousands of near-empty objects) that's nonsensical for
 * what these fields represent and wastes effort anywhere this data gets
 * rendered or copied (e.g. a future ApplicationSnapshot capturing profile
 * state). `metadata` stays an unbounded catch-all object, same reasoning as
 * `CreateOpportunityDto.metadata` (still covered by the 256kb request cap;
 * a bespoke JSON-size validator isn't justified without a concrete abuse
 * case behind it).
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nationality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FREE_TEXT_MAX_LENGTH)
  summary?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  education?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  experience?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  skills?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  certifications?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  languages?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
