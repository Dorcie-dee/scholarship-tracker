import { IsEnum } from 'class-validator';
import { UserRole } from '../../types';

/** ADMIN-only role assignment. Never accepted on PATCH /users/me. */
export class UpdateUserRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}
