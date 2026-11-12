import { Schema, model, models, Types } from 'mongoose';
import { DeadlineStatus, DeadlineType } from '../lib/enums';
import { baseSchemaOptions } from '../lib/schema-utils';

export interface DeadlineDoc {
  label: string;
  deadlineType: DeadlineType;
  date: Date;
  status: DeadlineStatus;
  opportunityId: Types.ObjectId | null;
  applicationId: Types.ObjectId | null;
  taskId: Types.ObjectId | null;
  requirementId: Types.ObjectId | null;
  notes: string | null;
}

const schema = new Schema<DeadlineDoc>(
  {
    label: { type: String, required: true },
    deadlineType: { type: String, enum: Object.values(DeadlineType), default: DeadlineType.OTHER },
    date: { type: Date, required: true },
    status: { type: String, enum: Object.values(DeadlineStatus), default: DeadlineStatus.UPCOMING },
    opportunityId: { type: Schema.Types.ObjectId, ref: 'Opportunity', default: null, index: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', default: null, index: true },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null, index: true },
    requirementId: { type: Schema.Types.ObjectId, ref: 'Requirement', default: null, index: true },
    notes: { type: String, default: null },
  },
  baseSchemaOptions,
);

/**
 * Group B / F5 parity — the original Postgres `@Check` constraint
 * ("at least one of the four FKs") as a second, schema-level line of
 * defense behind the service-layer check in
 * `server/services/deadlines.service.ts`'s `create()`.
 */
schema.pre('validate', function (next) {
  if (!this.opportunityId && !this.applicationId && !this.taskId && !this.requirementId) {
    next(new Error('A Deadline requires at least one of opportunityId/applicationId/taskId/requirementId'));
    return;
  }
  next();
});

export const Deadline = models.Deadline || model<DeadlineDoc>('Deadline', schema);
