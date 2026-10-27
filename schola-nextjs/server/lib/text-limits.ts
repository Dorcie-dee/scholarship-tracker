/**
 * Shared upper bounds for free-text fields — ported from the NestJS
 * backend's `common/validators/text-limits.ts`. Centralized so every
 * free-text field in this codebase is bounded by the same considered value.
 */
export const FREE_TEXT_MAX_LENGTH = 10_000;

/** OpportunitySource.extractedContent specifically — "an excerpt," not a full page archive. */
export const EXCERPT_MAX_LENGTH = 20_000;

export const EMAIL_MAX_LENGTH = 255;

export const CURSOR_MAX_LENGTH = 2_048;

/** Matches short catalog text fields (University.name, Opportunity.country, ...). */
export const SHORT_TEXT_MAX_LENGTH = 255;
