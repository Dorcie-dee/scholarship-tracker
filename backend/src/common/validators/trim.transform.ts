/**
 * `class-transformer` `@Transform()` callback: trims a string before
 * validation runs. Needed because `@IsNotEmpty()` alone does NOT reject a
 * whitespace-only string (confirmed by reading class-validator's own
 * source — `isNotEmpty` only checks `!== ''`) — used together with
 * `@IsNotEmpty()` on every required "name/title/label/description"-shaped
 * field across Group B's DTOs (University/Programme/Opportunity/
 * Requirement/Deadline) so whitespace-only input is actually rejected, and
 * so leading/trailing whitespace can't create near-duplicate catalog
 * entries that differ only by invisible whitespace.
 */
export const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
