import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CURSOR_MAX_LENGTH } from '../validators/text-limits';

/**
 * Shared query-param shape for every paginated list endpoint (Batch 4).
 * `limit` is intentionally not upper-bounded by a class-validator `@Max()`
 * here — the actual ceiling (`pagination.maxPageSize`, configurable) is
 * clamped in the service layer, where it can be a single, centrally-changed
 * value rather than duplicated across every DTO subclass.
 *
 * `cursor`'s `@MaxLength` (final verification pass) is deliberately here,
 * on the shared base class, not duplicated per paginated DTO — one fix
 * closes the gap for all ten paginated list endpoints at once.
 */
export class PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(CURSOR_MAX_LENGTH)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
