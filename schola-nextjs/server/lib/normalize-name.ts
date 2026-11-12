/**
 * Normalizes a University/Programme name for dedup matching — collapses
 * case and repeated/leading/trailing whitespace only. Deliberately does NOT
 * strip punctuation, expand abbreviations, or fold diacritics: "Univ. of
 * Twente" and "University of Twente" must remain distinct records, since
 * automatically merging them could silently conflate two things the user
 * never confirmed are the same institution. See
 * `docs/decisions.md`, "Catalog data vs. owned data (superseded)".
 */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}
