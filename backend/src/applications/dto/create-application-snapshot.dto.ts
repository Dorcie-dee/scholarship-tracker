import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Deliberately does NOT accept `createdVia` from the client — it is always set
 * to SnapshotCreatedVia.MANUAL by the service for this endpoint. Accepting it
 * here would let any caller falsely claim SUGGESTED origin before a
 * suggestion layer exists to legitimately produce that value.
 */
export class CreateApplicationSnapshotDto {
  /** Matches ApplicationSnapshot.label's varchar(255) column. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;
}
