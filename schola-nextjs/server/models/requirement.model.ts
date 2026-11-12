import { Schema, model, models, Types } from 'mongoose';
import { RequirementStatus, RequirementSuggestionSource, RequirementType } from '../lib/enums';
import { baseSchemaOptions } from '../lib/schema-utils';

export interface RequirementDoc {
  requirementType: RequirementType;
  description: string;
  status: RequirementStatus;
  opportunityId: Types.ObjectId | null;
  applicationId: Types.ObjectId | null;
  /** Provenance only, set once at Application-creation copy time — never a live link. */
  copiedFromRequirementId: Types.ObjectId | null;
  notes: string | null;
  /** Pending AI suggestion — never authoritative until the user confirms. */
  suggestedStatus: RequirementStatus | null;
  suggestedAt: Date | null;
  suggestionRationale: string | null;
  suggestionSource: RequirementSuggestionSource | null;
}

const schema = new Schema<RequirementDoc>(
  {
    requirementType: {
      type: String,
      enum: Object.values(RequirementType),
      default: RequirementType.OTHER,
    },
    description: { type: String, required: true },
    status: { type: String, enum: Object.values(RequirementStatus), default: RequirementStatus.UNKNOWN },
    opportunityId: { type: Schema.Types.ObjectId, ref: 'Opportunity', default: null, index: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', default: null, index: true },
    copiedFromRequirementId: { type: Schema.Types.ObjectId, ref: 'Requirement', default: null },
    notes: { type: String, default: null },
    suggestedStatus: { type: String, enum: Object.values(RequirementStatus), default: null },
    suggestedAt: { type: Date, default: null },
    suggestionRationale: { type: String, default: null },
    suggestionSource: {
      type: String,
      enum: Object.values(RequirementSuggestionSource),
      default: null,
    },
  },
  baseSchemaOptions,
);

/** Group B / F5 parity — see deadline.model.ts's identical pattern. */
schema.pre('validate', function (next) {
  if (!this.opportunityId && !this.applicationId) {
    next(new Error('A Requirement requires at least one of opportunityId/applicationId'));
    return;
  }
  next();
});

export const Requirement = models.Requirement || model<RequirementDoc>('Requirement', schema);
