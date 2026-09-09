import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import {
  IsWithinBcryptByteLimit,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../password-policy';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsWithinBcryptByteLimit()
  newPassword: string;
}
