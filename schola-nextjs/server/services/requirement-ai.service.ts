import type { HydratedDocument } from 'mongoose';
import {
  RequirementStatus,
  RequirementSuggestionSource,
  RequirementType,
} from '../lib/enums';
import { Requirement, type RequirementDoc } from '../models/requirement.model';
import { ApplicantProfile } from '../models/applicant-profile.model';
import { getConfig } from '../lib/config';
import { BadRequestError, ConflictError, NotFoundError, ServiceUnavailableError } from '../lib/http-errors';
import { findRequirementAccessible } from './requirements.service';

/**
 * Ported from `requirements/ai/*`. Combines what the original split into
 * `heuristic-requirement-ai.provider.ts` + `requirement-ai.service.ts` into
 * one file (per the porting instructions) — there's no DI container here to
 * swap providers through, so the "provider interface" layer buys nothing.
 *
 * `suggest()` persists only the pending `suggested*` fields — authoritative
 * `status` is never touched until an explicit `confirm()`.
 */

const AUTHORITATIVE_STATUSES = new Set<RequirementStatus>([
  RequirementStatus.CONFIRMED,
  RequirementStatus.NOT_MET,
  RequirementStatus.NOT_APPLICABLE,
]);

interface ProfileSignals {
  hasNationality: boolean;
  hasSummary: boolean;
  educationCount: number;
  experienceCount: number;
  skillCount: number;
  languageCount: number;
  certificationCount: number;
  nationalityHint?: string;
  languageHints?: string[];
}

interface HeuristicInput {
  requirementType: RequirementType;
  description: string;
  profileSignals: ProfileSignals;
}

interface HeuristicResult {
  suggestedStatus: RequirementStatus;
  rationale: string;
  source: RequirementSuggestionSource;
}

/**
 * Deterministic, rules-based heuristic — ported verbatim from
 * `heuristic-requirement-ai.provider.ts`. Not a real ML/LLM call.
 */
export function computeHeuristicSuggestion(input: HeuristicInput): HeuristicResult {
  const { requirementType, profileSignals, description } = input;
  const desc = description.toLowerCase();

  switch (requirementType) {
    case RequirementType.NATIONALITY: {
      if (!profileSignals.hasNationality) {
        return {
          suggestedStatus: RequirementStatus.NEEDS_VERIFICATION,
          rationale: 'No nationality on your profile yet.',
          source: RequirementSuggestionSource.HEURISTIC,
        };
      }
      const hint = profileSignals.nationalityHint?.toLowerCase();
      if (hint && desc.includes(hint)) {
        return {
          suggestedStatus: RequirementStatus.PROFILE_MATCH,
          rationale: 'Profile nationality appears to match this requirement.',
          source: RequirementSuggestionSource.HEURISTIC,
        };
      }
      return {
        suggestedStatus: RequirementStatus.AI_ASSESSMENT,
        rationale: 'Nationality is on your profile; confirm against the requirement text.',
        source: RequirementSuggestionSource.HEURISTIC,
      };
    }
    case RequirementType.LANGUAGE: {
      if (!profileSignals.languageCount) {
        return {
          suggestedStatus: RequirementStatus.NEEDS_VERIFICATION,
          rationale: 'No languages listed on your profile.',
          source: RequirementSuggestionSource.HEURISTIC,
        };
      }
      const hit = profileSignals.languageHints?.find((l) => desc.includes(l.toLowerCase()));
      if (hit) {
        return {
          suggestedStatus: RequirementStatus.PROFILE_MATCH,
          rationale: `A language on your profile (${hit}) may satisfy this requirement.`,
          source: RequirementSuggestionSource.HEURISTIC,
        };
      }
      return {
        suggestedStatus: RequirementStatus.AI_ASSESSMENT,
        rationale: 'Languages are on your profile; verify level or score.',
        source: RequirementSuggestionSource.HEURISTIC,
      };
    }
    case RequirementType.DEGREE:
    case RequirementType.ACADEMIC:
    case RequirementType.GPA:
      if (!profileSignals.educationCount) {
        return {
          suggestedStatus: RequirementStatus.NEEDS_VERIFICATION,
          rationale: 'No education entries on your profile.',
          source: RequirementSuggestionSource.HEURISTIC,
        };
      }
      return {
        suggestedStatus: RequirementStatus.AI_ASSESSMENT,
        rationale: 'Education is present; confirm degree or GPA details.',
        source: RequirementSuggestionSource.HEURISTIC,
      };
    case RequirementType.WORK_EXPERIENCE:
      if (!profileSignals.experienceCount) {
        return {
          suggestedStatus: RequirementStatus.NEEDS_VERIFICATION,
          rationale: 'No experience entries on your profile.',
          source: RequirementSuggestionSource.HEURISTIC,
        };
      }
      return {
        suggestedStatus: RequirementStatus.AI_ASSESSMENT,
        rationale: 'Experience is present; confirm duration and relevance.',
        source: RequirementSuggestionSource.HEURISTIC,
      };
    case RequirementType.DOCUMENT:
    case RequirementType.RECOMMENDATION:
    case RequirementType.INTERVIEW:
    case RequirementType.APPLICATION_PORTAL:
      return {
        suggestedStatus: RequirementStatus.NEEDS_VERIFICATION,
        rationale: 'This requirement needs a concrete action or document.',
        source: RequirementSuggestionSource.HEURISTIC,
      };
    default:
      if (profileSignals.hasSummary) {
        return {
          suggestedStatus: RequirementStatus.AI_ASSESSMENT,
          rationale: 'Compared against your profile; confirm manually.',
          source: RequirementSuggestionSource.HEURISTIC,
        };
      }
      return {
        suggestedStatus: RequirementStatus.NEEDS_VERIFICATION,
        rationale: 'Not enough profile signal to auto-suggest.',
        source: RequirementSuggestionSource.HEURISTIC,
      };
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new ServiceUnavailableError('AI suggestion timed out')), timeoutMs);
    }),
  ]);
}

export async function suggestRequirementStatus(
  userId: string,
  requirementId: string,
): Promise<HydratedDocument<RequirementDoc>> {
  const { enabled, timeoutMs } = getConfig().requirementAi;
  if (!enabled) {
    throw new ServiceUnavailableError('Requirement AI suggestions are disabled');
  }

  const requirement = await findRequirementAccessible(requirementId, userId);
  if (!requirement.applicationId) {
    throw new BadRequestError('Only application requirements can receive AI suggestions');
  }
  if (AUTHORITATIVE_STATUSES.has(requirement.status)) {
    throw new ConflictError(
      'This requirement already has a confirmed status; clear or change it before requesting a new suggestion',
    );
  }

  const profile = await ApplicantProfile.findOne({ userId });
  if (!profile) {
    throw new NotFoundError('Profile not found');
  }

  const profileSignals: ProfileSignals = {
    hasNationality: Boolean(profile.nationality),
    hasSummary: Boolean(profile.summary),
    educationCount: profile.education?.length ?? 0,
    experienceCount: profile.experience?.length ?? 0,
    skillCount: profile.skills?.length ?? 0,
    languageCount: profile.languages?.length ?? 0,
    certificationCount: profile.certifications?.length ?? 0,
    nationalityHint: profile.nationality ?? undefined,
    languageHints: (profile.languages ?? [])
      .map((l: Record<string, unknown>) => {
        const raw = l.language ?? l.name;
        return typeof raw === 'string' ? raw.trim() : '';
      })
      .filter(Boolean)
      .slice(0, 10),
  };

  let result: HeuristicResult;
  try {
    result = await withTimeout(
      Promise.resolve(
        computeHeuristicSuggestion({
          requirementType: requirement.requirementType,
          description: requirement.description,
          profileSignals,
        }),
      ),
      timeoutMs,
    );
  } catch (error) {
    if (error instanceof ServiceUnavailableError || error instanceof BadRequestError) {
      throw error;
    }
    throw new ServiceUnavailableError('AI suggestion failed; your requirement status was not changed');
  }

  if (!Object.values(RequirementStatus).includes(result.suggestedStatus)) {
    throw new ServiceUnavailableError('AI provider returned an invalid status; nothing was saved');
  }
  const rationale = (result.rationale ?? '').trim().slice(0, 1000);
  if (!rationale) {
    throw new ServiceUnavailableError('AI provider returned an empty rationale; nothing was saved');
  }

  requirement.suggestedStatus = result.suggestedStatus;
  requirement.suggestedAt = new Date();
  requirement.suggestionRationale = rationale;
  requirement.suggestionSource = result.source;
  return requirement.save();
}

export async function confirmRequirementSuggestion(
  userId: string,
  requirementId: string,
): Promise<HydratedDocument<RequirementDoc>> {
  // Ownership check first, then an atomic conditional update — this project
  // has no multi-document transaction need here (a single-document update is
  // already atomic), unlike the original's pessimistic row lock inside a
  // transaction, which existed to serialize against a concurrent `suggest()`/
  // `confirm()`/`reject()` on the SAME row; `findOneAndUpdate` with a
  // `suggestedStatus: { $ne: null }` guard gives the same race-safety.
  await findRequirementAccessible(requirementId, userId);
  const updated = await Requirement.findOneAndUpdate(
    { _id: requirementId, suggestedStatus: { $ne: null } },
    [
      {
        $set: {
          status: '$suggestedStatus',
          suggestedStatus: null,
          suggestedAt: null,
          suggestionRationale: null,
          suggestionSource: null,
        },
      },
    ],
    { new: true },
  );
  if (!updated) {
    throw new ConflictError('No pending AI suggestion to confirm');
  }
  return updated;
}

export async function rejectRequirementSuggestion(
  userId: string,
  requirementId: string,
): Promise<HydratedDocument<RequirementDoc>> {
  await findRequirementAccessible(requirementId, userId);
  const updated = await Requirement.findOneAndUpdate(
    { _id: requirementId, suggestedStatus: { $ne: null } },
    {
      $set: {
        suggestedStatus: null,
        suggestedAt: null,
        suggestionRationale: null,
        suggestionSource: null,
      },
    },
    { new: true },
  );
  if (!updated) {
    throw new ConflictError('No pending AI suggestion to reject');
  }
  return updated;
}
