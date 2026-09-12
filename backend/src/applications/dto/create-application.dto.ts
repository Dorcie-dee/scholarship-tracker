import { ApplicationStatus, ApplicationType } from '../../types';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { FREE_TEXT_MAX_LENGTH } from '../../common/validators/text-limits';

export class CreateApplicationDto {
  @IsUUID()
  journeyId: string;

  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsEnum(ApplicationType)
  applicationType?: ApplicationType;

  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @IsOptional()
  @IsUUID()
  opportunityId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  submissionDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  portal?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(1024)
  externalUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FREE_TEXT_MAX_LENGTH)
  notes?: string;
}
