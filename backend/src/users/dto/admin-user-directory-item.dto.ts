import { UserRole } from '../../types';

/**
 * ADMIN directory item — intentionally smaller than the User entity.
 * Never includes passwordHash, sessions, OTPs, or reset tokens.
 * Interface (not class): response mapping shape only — no ValidationPipe input.
 */
export interface AdminUserDirectoryItemDto {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  isVerified: boolean;
  createdAt: Date;
}

export function toAdminUserDirectoryItem(row: {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  isVerified: boolean;
  createdAt: Date;
}): AdminUserDirectoryItemDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isVerified: row.isVerified,
    createdAt: row.createdAt,
  };
}
