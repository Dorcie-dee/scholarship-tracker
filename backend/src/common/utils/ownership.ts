import { ForbiddenException } from '@nestjs/common';

/**
 * Shared ownership check used by every module whose resources are scoped to a
 * user (journeys, applications, tasks, documents, ...). Kept as one function
 * rather than duplicating the same three lines in each service.
 */
export function assertOwnership(
  resourceUserId: string,
  currentUserId: string,
): void {
  if (resourceUserId !== currentUserId) {
    throw new ForbiddenException('You do not have access to this resource');
  }
}
