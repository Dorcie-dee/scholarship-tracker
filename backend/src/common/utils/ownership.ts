import { NotFoundException } from '@nestjs/common';

/**
 * Shared ownership check used by every module whose resources are scoped to a
 * user (journeys, applications, tasks, documents, ...). Kept as one function
 * rather than duplicating the same three lines in each service.
 *
 * Track 1 Group E (E2) — throws `NotFoundException` (404), not
 * `ForbiddenException` (403). A resource that exists but belongs to another
 * user must respond identically to one that doesn't exist at all — the
 * caller has no legitimate way to distinguish "not yours" from "doesn't
 * exist" for any resource reached through this check, closing a minor
 * existence-disclosure inconsistency the Group E inspection found (403 vs.
 * 404 let a caller infer that *some* resource exists at a given id, even
 * without access to it). This matches the safer dual-predicate pattern
 * already established for ApplicationSnapshotsService.findOneOrThrow() and
 * ApplicationDocumentsService.detach() (Track 1 Group D), now made uniform
 * across every caller of this shared helper.
 *
 * This is NOT the same kind of 403 `RolesGuard` throws (see
 * auth/guards/roles.guard.ts) — that one is a genuine, intentional 403: an
 * authenticated caller who is unambiguously themselves, correctly identified,
 * simply lacking the ADMIN role a shared catalog mutation requires. That
 * case has nothing to hide (the resource's existence is never in question —
 * shared catalog data is readable by any authenticated user already) and
 * stays a 403, unchanged.
 */
export function assertOwnership(
  resourceUserId: string,
  currentUserId: string,
): void {
  if (resourceUserId !== currentUserId) {
    throw new NotFoundException('Resource not found');
  }
}
