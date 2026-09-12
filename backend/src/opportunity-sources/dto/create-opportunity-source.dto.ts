import { OpportunitySourceType, SourceAuthorityLevel } from '../../types';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
} from 'class-validator';
import {
  EXCERPT_MAX_LENGTH,
  FREE_TEXT_MAX_LENGTH,
} from '../../common/validators/text-limits';

export class CreateOpportunitySourceDto {
  @IsUUID()
  opportunityId: string;

  @IsOptional()
  @IsEnum(OpportunitySourceType)
  sourceType?: OpportunitySourceType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceName?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(1024)
  sourceUrl?: string;

  @IsOptional()
  @IsDateString()
  capturedAt?: string;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  /** The relevant excerpt used at capture time — not a full page archive. */
  @IsOptional()
  @IsString()
  @MaxLength(EXCERPT_MAX_LENGTH)
  extractedContent?: string;

  @IsOptional()
  @IsEnum(SourceAuthorityLevel)
  authorityLevel?: SourceAuthorityLevel;

  @IsOptional()
  @IsString()
  @MaxLength(FREE_TEXT_MAX_LENGTH)
  notes?: string;

  /**
   * When true and `sourceUrl` is set, the server fetches the page (SSRF-safe)
   * and fills `extractedContent` / `sourceName` when those were left empty.
   */
  @IsOptional()
  @IsBoolean()
  autoFetch?: boolean;
}
