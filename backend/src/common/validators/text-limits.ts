/**
 * Production hardening (Batch 8) — shared upper bounds for free-text DTO
 * fields that map to an unbounded Postgres `text` column. Before this,
 * fields like `notes`/`description`/`goal`/`eligibilitySummary` had no
 * `@MaxLength` at all — bounded only by the global request body limit
 * (`bootstrap.ts`'s 256kb, Batch 1), which is a whole-request budget, not a
 * per-field one: a single oversized field could consume it entirely, and
 * nothing stopped a legitimate-looking request from writing an arbitrarily
 * long string into a `text` column repeatedly, growing table/index size for
 * no functional benefit. Centralized here (rather than a magic number
 * per-DTO) so every free-text field in this codebase is bounded by the same
 * considered value, and a future change to that value happens once — same
 * reasoning as `password-policy.ts`'s shared `PASSWORD_MAX_LENGTH`.
 *
 * These are generous, not tight: large enough that no legitimate note,
 * description, or summary would ever hit the limit, small enough to make
 * pathological/abusive input impossible. Not a data-modeling decision (the
 * underlying columns stay `text`, not `varchar(n)`) — purely an
 * application-layer input bound.
 */
export const FREE_TEXT_MAX_LENGTH = 10_000;

/**
 * `OpportunitySource.extractedContent` specifically: documented as "the
 * relevant excerpt used at capture time — not a full page archive", which
 * can reasonably run longer than a note or description.
 */
export const EXCERPT_MAX_LENGTH = 20_000;

/** Matches `User.email`'s `varchar(255)` column — see user.entity.ts. */
export const EMAIL_MAX_LENGTH = 255;

/**
 * Final verification pass — a real gap the previous batches' sweep missed:
 * `PaginationQueryDto.cursor` (shared by every paginated list endpoint) had
 * no `@MaxLength` at all, unlike every other client-controllable string
 * field in this codebase. A real cursor (base64url-encoded `{sortValue,
 * id}` JSON — see `common/pagination/cursor.ts`) is always short in
 * practice; `decodeCursor()` does reject a malformed one, but only after
 * class-validator has already accepted an arbitrarily long string at the
 * DTO layer. 2048 is generous headroom over any real cursor (even a long
 * free-text sort value plus a UUID, base64-encoded, stays well under a few
 * hundred bytes) while still bounding a pathologically oversized value
 * before it reaches the parsing/decoding step at all.
 */
export const CURSOR_MAX_LENGTH = 2_048;

/** Matches `varchar(255)` filter/search columns (`University.name`, `Opportunity.country`, ...). */
export const SHORT_TEXT_MAX_LENGTH = 255;
