import { Transform } from 'class-transformer';
import { StudyLevel } from '../../types';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { trim } from '../../common/validators/trim.transform';

export class CreateProgrammeDto {
  @IsUUID()
  universityId: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsEnum(StudyLevel)
  studyLevel?: StudyLevel;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  field?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  duration?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(512)
  website?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
