import { Transform } from 'class-transformer';
import { RequirementStatus, RequirementType } from '../../types';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { trim } from '../../common/validators/trim.transform';
import { FREE_TEXT_MAX_LENGTH } from '../../common/validators/text-limits';

export class CreateRequirementDto {
  @IsEnum(RequirementType)
  requirementType: RequirementType;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(FREE_TEXT_MAX_LENGTH)
  description: string;

  @IsOptional()
  @IsEnum(RequirementStatus)
  status?: RequirementStatus;

  @IsOptional()
  @IsUUID()
  opportunityId?: string;

  @IsOptional()
  @IsUUID()
  applicationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FREE_TEXT_MAX_LENGTH)
  notes?: string;
}
