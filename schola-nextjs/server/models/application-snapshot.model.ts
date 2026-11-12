import { Schema, model, models, Types } from 'mongoose';
import { SnapshotCreatedVia } from '../lib/enums';
import { baseSchemaOptions } from '../lib/schema-utils';

/**
 * Point-in-time historical record for an Application, with append-only
 * revisioning for edits (`supersedesSnapshotId`) — historical rows are
 * never mutated in place. See docs/decisions.md in the original backend,
 * "Application Snapshot creation model".
 */
export interface ApplicationSnapshotDoc {
  applicationId: Types.ObjectId;
  label: string | null;
  createdVia: SnapshotCreatedVia;
  data: Record<string, unknown>;
  supersedesSnapshotId: Types.ObjectId | null;
}

const schema = new Schema<ApplicationSnapshotDoc>(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
    label: { type: String, default: null },
    createdVia: {
      type: String,
      enum: Object.values(SnapshotCreatedVia),
      default: SnapshotCreatedVia.MANUAL,
    },
    data: { type: Schema.Types.Mixed, required: true },
    supersedesSnapshotId: { type: Schema.Types.ObjectId, ref: 'ApplicationSnapshot', default: null, index: true },
  },
  baseSchemaOptions,
);

export const ApplicationSnapshot =
  models.ApplicationSnapshot || model<ApplicationSnapshotDoc>('ApplicationSnapshot', schema);
