import { Transform } from 'class-transformer';
import { OpportunityType, StudyLevel } from '../../types';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
import { trim } from '../../common/validators/trim.transform';

export class CreateOpportunityDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  provider?: string;

  @IsOptional()
  @IsEnum(OpportunityType)
  opportunityType?: OpportunityType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fundingType?: string;

  // Group B / I2 fix: @IsNumberString() alone allowed negative values (a
  // funding amount can't sensibly be negative). Matches numeric(12,2)'s
  // shape: a non-negative number with up to 2 decimal places.
  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message:
      'fundingAmount must be a non-negative number with up to 2 decimal places',
  })
  fundingAmount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  duration?: string;

  @IsOptional()
  @IsEnum(StudyLevel)
  studyLevel?: StudyLevel;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  field?: string;

  @IsOptional()
  @IsString()
  eligibilitySummary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  applicationMethod?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(1024)
  applicationUrl?: string;

  @IsOptional()
  @IsUUID()
  universityId?: string;

  @IsOptional()
  @IsUUID()
  programmeId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
