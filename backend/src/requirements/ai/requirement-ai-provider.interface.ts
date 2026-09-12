import {
  RequirementStatus,
  RequirementSuggestionSource,
  RequirementType,
} from '../../types';

/** Privacy-minimized input for requirement AI suggestion — never raw documents or secrets. */
export interface RequirementAiSuggestionInput {
  requirementType: RequirementType;
  description: string;
  currentStatus: RequirementStatus;
  profileSignals: {
    hasNationality: boolean;
    hasSummary: boolean;
    educationCount: number;
    experienceCount: number;
    skillCount: number;
    languageCount: number;
    certificationCount: number;
    nationalityHint?: string;
    languageHints?: string[];
  };
}

export interface RequirementAiSuggestionResult {
  suggestedStatus: RequirementStatus;
  rationale: string;
  source: RequirementSuggestionSource;
}

export const REQUIREMENT_AI_PROVIDER = Symbol('REQUIREMENT_AI_PROVIDER');

export interface RequirementAiProvider {
  suggest(
    input: RequirementAiSuggestionInput,
  ): Promise<RequirementAiSuggestionResult>;
}
