import { Transform } from 'class-transformer';
import { DeadlineStatus, DeadlineType } from '../../types';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { trim } from '../../common/validators/trim.transform';
import { FREE_TEXT_MAX_LENGTH } from '../../common/validators/text-limits';

export class CreateDeadlineDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label: string;

  @IsOptional()
  @IsEnum(DeadlineType)
  deadlineType?: DeadlineType;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsEnum(DeadlineStatus)
  status?: DeadlineStatus;

  @IsOptional()
  @IsUUID()
  opportunityId?: string;

  @IsOptional()
  @IsUUID()
  applicationId?: string;

  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @IsUUID()
  requirementId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FREE_TEXT_MAX_LENGTH)
  notes?: string;
}
