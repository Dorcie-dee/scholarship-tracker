import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  IsWithinBcryptByteLimit,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../password-policy';
import { EMAIL_MAX_LENGTH } from '../../common/validators/text-limits';

export class RegisterDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsWithinBcryptByteLimit()
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;
}
