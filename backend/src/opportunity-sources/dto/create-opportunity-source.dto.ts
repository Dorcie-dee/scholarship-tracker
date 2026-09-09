import { OpportunitySourceType, SourceAuthorityLevel } from '../../types';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
} from 'class-validator';

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
  extractedContent?: string;

  @IsOptional()
  @IsEnum(SourceAuthorityLevel)
  authorityLevel?: SourceAuthorityLevel;

  @IsOptional()
  @IsString()
  notes?: string;
}
