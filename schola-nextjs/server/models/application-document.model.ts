import { Schema, model, models, Types } from 'mongoose';
import { baseSchemaOptions } from '../lib/schema-utils';

/**
 * Join between an Application and the EXACT Document version attached to it.
 * `documentId` is fixed at attach time — re-attaching a newer version
 * requires an explicit new row, which is what guarantees a historical
 * Application never silently changes when the user's current documents do.
 */
export interface ApplicationDocumentDoc {
  applicationId: Types.ObjectId;
  documentId: Types.ObjectId;
  /** e.g. "Statement of Purpose" — role within this application, not a type-based restriction. */
  label: string | null;
  attachedAt: Date;
}

const schema = new Schema<ApplicationDocumentDoc>(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    label: { type: String, default: null },
    attachedAt: { type: Date, required: true },
  },
  baseSchemaOptions,
);

// The same exact document version cannot be attached to the same application twice —
// enforced here (race-safe by construction), same as the original's DB-level unique constraint.
schema.index({ applicationId: 1, documentId: 1 }, { unique: true });

export const ApplicationDocument =
  models.ApplicationDocument || model<ApplicationDocumentDoc>('ApplicationDocument', schema);
