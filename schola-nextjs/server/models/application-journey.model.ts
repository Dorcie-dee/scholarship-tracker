import { Schema, model, models, Types } from 'mongoose';
import { JourneyStatus } from '../lib/enums';
import { baseSchemaOptions } from '../lib/schema-utils';

export interface ApplicationJourneyDoc {
  userId: Types.ObjectId;
  title: string;
  goal: string | null;
  status: JourneyStatus;
  universityId: Types.ObjectId | null;
  programmeId: Types.ObjectId | null;
  notes: string | null;
}

const schema = new Schema<ApplicationJourneyDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    goal: { type: String, default: null },
    status: { type: String, enum: Object.values(JourneyStatus), default: JourneyStatus.PLANNING },
    universityId: { type: Schema.Types.ObjectId, ref: 'University', default: null, index: true },
    programmeId: { type: Schema.Types.ObjectId, ref: 'Programme', default: null, index: true },
    notes: { type: String, default: null },
  },
  baseSchemaOptions,
);

export const ApplicationJourney =
  models.ApplicationJourney || model<ApplicationJourneyDoc>('ApplicationJourney', schema);
