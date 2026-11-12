import { Schema, model, models, Types } from 'mongoose';
import { ContentOrigin, OpportunitySourceType, SourceAuthorityLevel } from '../lib/enums';
import { baseSchemaOptions } from '../lib/schema-utils';

export interface OpportunitySourceDoc {
  /**
   * Denormalized from the parent Opportunity at creation time — lets
   * `listOpportunitySources()` scope an unfiltered (no `opportunityId`)
   * list query by owner directly, without an extra join/lookup per row.
   * Never reassigned after creation (a source can be re-parented to a
   * different `opportunityId` the caller owns, but `ownerId` always follows
   * the caller doing the re-parenting, not the new opportunity — see
   * `updateOpportunitySource()`).
   */
  ownerId: Types.ObjectId;
  opportunityId: Types.ObjectId;
  sourceType: OpportunitySourceType;
  sourceName: string | null;
  sourceUrl: string | null;
  capturedAt: Date;
  publishedAt: Date | null;
  /** The relevant excerpt used at capture time — never a full page archive. */
  extractedContent: string | null;
  authorityLevel: SourceAuthorityLevel;
  notes: string | null;
  contentOrigin: ContentOrigin;
}

const schema = new Schema<OpportunitySourceDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    opportunityId: { type: Schema.Types.ObjectId, ref: 'Opportunity', required: true, index: true },
    sourceType: {
      type: String,
      enum: Object.values(OpportunitySourceType),
      default: OpportunitySourceType.MANUAL_ENTRY,
    },
    sourceName: { type: String, default: null },
    sourceUrl: { type: String, default: null },
    capturedAt: { type: Date, required: true },
    publishedAt: { type: Date, default: null },
    extractedContent: { type: String, default: null },
    authorityLevel: {
      type: String,
      enum: Object.values(SourceAuthorityLevel),
      default: SourceAuthorityLevel.UNVERIFIED,
    },
    notes: { type: String, default: null },
    contentOrigin: {
      type: String,
      enum: Object.values(ContentOrigin),
      default: ContentOrigin.MANUAL,
    },
  },
  baseSchemaOptions,
);

export const OpportunitySource =
  models.OpportunitySource || model<OpportunitySourceDoc>('OpportunitySource', schema);
