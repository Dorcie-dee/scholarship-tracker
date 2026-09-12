import { Injectable } from '@nestjs/common';
import {
  RequirementStatus,
  RequirementSuggestionSource,
  RequirementType,
} from '../../types';
import type {
  RequirementAiProvider,
  RequirementAiSuggestionInput,
  RequirementAiSuggestionResult,
} from './requirement-ai-provider.interface';

/**
 * Deterministic heuristic provider for tests/dev — replaceable via DI.
 * Does not call an external LLM.
 */
@Injectable()
export class HeuristicRequirementAiProvider implements RequirementAiProvider {
  suggest(
    input: RequirementAiSuggestionInput,
  ): Promise<RequirementAiSuggestionResult> {
    return Promise.resolve(this.compute(input));
  }

  private compute(
    input: RequirementAiSuggestionInput,
  ): RequirementAiSuggestionResult {
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
          rationale:
            'Nationality is on your profile; confirm against the requirement text.',
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
        const hit = profileSignals.languageHints?.find((l) =>
          desc.includes(l.toLowerCase()),
        );
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
}
