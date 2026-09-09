import { Transform } from 'class-transformer';
import { RequirementStatus, RequirementType } from '../../types';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { trim } from '../../common/validators/trim.transform';

export class CreateRequirementDto {
  @IsEnum(RequirementType)
  requirementType: RequirementType;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
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
  notes?: string;
}
