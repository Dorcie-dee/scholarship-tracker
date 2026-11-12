import { Schema, model, models, Types } from 'mongoose';
import { ApplicationStatus, ApplicationType } from '../lib/enums';
import { baseSchemaOptions } from '../lib/schema-utils';

export interface ApplicationDoc {
  journeyId: Types.ObjectId;
  title: string;
  applicationType: ApplicationType;
  status: ApplicationStatus;
  opportunityId: Types.ObjectId | null;
  startDate: string | null;
  submissionDate: string | null;
  portal: string | null;
  externalUrl: string | null;
  notes: string | null;
  /**
   * Soft delete (deliberately scoped to Application only — every other
   * entity in this codebase stays hard-delete; see docs/decisions.md in the
   * original backend, "Batch 7 — Application soft-delete"). Every read path
   * MUST filter `deletedAt: null` explicitly — Mongoose has no automatic
   * equivalent of TypeORM's `@DeleteDateColumn` query exclusion, so this is
   * never implicit. See `server/services/applications.service.ts`.
   */
  deletedAt: Date | null;
}

const schema = new Schema<ApplicationDoc>(
  {
    journeyId: { type: Schema.Types.ObjectId, ref: 'ApplicationJourney', required: true, index: true },
    title: { type: String, required: true },
    applicationType: {
      type: String,
      enum: Object.values(ApplicationType),
      default: ApplicationType.OTHER,
    },
    status: {
      type: String,
      enum: Object.values(ApplicationStatus),
      default: ApplicationStatus.NOT_STARTED,
    },
    opportunityId: { type: Schema.Types.ObjectId, ref: 'Opportunity', default: null, index: true },
    startDate: { type: String, default: null },
    submissionDate: { type: String, default: null },
    portal: { type: String, default: null },
    externalUrl: { type: String, default: null },
    notes: { type: String, default: null },
    deletedAt: { type: Date, default: null, index: true },
  },
  baseSchemaOptions,
);

export const Application = models.Application || model<ApplicationDoc>('Application', schema);
