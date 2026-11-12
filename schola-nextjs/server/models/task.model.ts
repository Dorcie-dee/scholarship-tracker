import { Schema, model, models, Types } from 'mongoose';
import { TaskDependencyType, TaskPriority, TaskStatus } from '../lib/enums';
import { baseSchemaOptions } from '../lib/schema-utils';

export interface TaskDoc {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  completedAt: Date | null;
  applicationId: Types.ObjectId | null;
  /** Always present — every task belongs to a Journey, even one with no `applicationId`. */
  journeyId: Types.ObjectId;
  requirementId: Types.ObjectId | null;
  /** Informational only — see class doc comment in the original entity. Never enforced. */
  dependsOnTaskId: Types.ObjectId | null;
  dependencyType: TaskDependencyType | null;
}

const schema = new Schema<TaskDoc>(
  {
    title: { type: String, required: true },
    description: { type: String, default: null },
    status: { type: String, enum: Object.values(TaskStatus), default: TaskStatus.TODO },
    priority: { type: String, enum: Object.values(TaskPriority), default: TaskPriority.MEDIUM },
    dueDate: { type: String, default: null },
    completedAt: { type: Date, default: null },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', default: null, index: true },
    journeyId: { type: Schema.Types.ObjectId, ref: 'ApplicationJourney', required: true, index: true },
    requirementId: { type: Schema.Types.ObjectId, ref: 'Requirement', default: null, index: true },
    dependsOnTaskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    dependencyType: { type: String, enum: Object.values(TaskDependencyType), default: null },
  },
  baseSchemaOptions,
);

export const Task = models.Task || model<TaskDoc>('Task', schema);
