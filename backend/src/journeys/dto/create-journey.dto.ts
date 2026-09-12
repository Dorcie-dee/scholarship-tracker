import { JourneyStatus } from '../../types';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { FREE_TEXT_MAX_LENGTH } from '../../common/validators/text-limits';

export class CreateJourneyDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(FREE_TEXT_MAX_LENGTH)
  goal?: string;

  @IsOptional()
  @IsEnum(JourneyStatus)
  status?: JourneyStatus;

  @IsOptional()
  @IsUUID()
  universityId?: string;

  @IsOptional()
  @IsUUID()
  programmeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FREE_TEXT_MAX_LENGTH)
  notes?: string;
}
