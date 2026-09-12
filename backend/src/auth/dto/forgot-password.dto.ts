import { IsEmail, MaxLength } from 'class-validator';
import { EMAIL_MAX_LENGTH } from '../../common/validators/text-limits';

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email: string;
}
