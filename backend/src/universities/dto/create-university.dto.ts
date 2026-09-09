import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { trim } from '../../common/validators/trim.transform';

export class CreateUniversityDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  country?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(512)
  website?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
