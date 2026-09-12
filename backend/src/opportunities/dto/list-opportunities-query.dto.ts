import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { OpportunityType, StudyLevel } from '../../types';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { SHORT_TEXT_MAX_LENGTH } from '../../common/validators/text-limits';

export class ListOpportunitiesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(StudyLevel)
  studyLevel?: StudyLevel;

  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  country?: string;

  @IsOptional()
  @IsEnum(OpportunityType)
  opportunityType?: OpportunityType;

  @IsOptional()
  @IsUUID()
  universityId?: string;

  @IsOptional()
  @IsUUID()
  programmeId?: string;
}
