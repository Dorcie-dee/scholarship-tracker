import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Append-only snapshot edit: creates a NEW revision that supersedes the
 * target. Clients cannot set applicationId, createdVia, lineage, or createdAt.
 */
export class EditApplicationSnapshotDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string | null;

  /**
   * Full replacement of the snapshot data blob for the new revision.
   * Omit to carry forward the previous revision's data unchanged (label-only edit).
   */
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
