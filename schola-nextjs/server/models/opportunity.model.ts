import { Schema, model, models, Types } from 'mongoose';
import { OpportunityType, StudyLevel } from '../lib/enums';
import { baseSchemaOptions } from '../lib/schema-utils';

export interface OpportunityDoc {
  title: string;
  provider: string | null;
  opportunityType: OpportunityType;
  country: string | null;
  fundingType: string | null;
  fundingAmount: string | null;
  currency: string | null;
  duration: string | null;
  studyLevel: StudyLevel | null;
  field: string | null;
  eligibilitySummary: string | null;
  applicationMethod: string | null;
  applicationUrl: string | null;
  universityId: Types.ObjectId | null;
  programmeId: Types.ObjectId | null;
  /** Catch-all for fields that don't fit the predefined schema. */
  metadata: Record<string, unknown>;
}

const schema = new Schema<OpportunityDoc>(
  {
    title: { type: String, required: true },
    provider: { type: String, default: null },
    opportunityType: {
      type: String,
      enum: Object.values(OpportunityType),
      default: OpportunityType.SCHOLARSHIP,
    },
    country: { type: String, default: null },
    fundingType: { type: String, default: null },
    fundingAmount: { type: String, default: null },
    currency: { type: String, default: null },
    duration: { type: String, default: null },
    studyLevel: { type: String, enum: Object.values(StudyLevel), default: null },
    field: { type: String, default: null },
    eligibilitySummary: { type: String, default: null },
    applicationMethod: { type: String, default: null },
    applicationUrl: { type: String, default: null },
    universityId: { type: Schema.Types.ObjectId, ref: 'University', default: null, index: true },
    programmeId: { type: Schema.Types.ObjectId, ref: 'Programme', default: null, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  baseSchemaOptions,
);

// OpportunitiesService.findAll()'s default keyset pagination sorts on exactly this pair.
schema.index({ createdAt: 1, _id: 1 });

export const Opportunity = models.Opportunity || model<OpportunityDoc>('Opportunity', schema);
