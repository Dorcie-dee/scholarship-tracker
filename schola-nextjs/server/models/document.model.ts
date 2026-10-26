import { Schema, model, models, Types } from 'mongoose';
import { DocumentType } from '../lib/enums';
import { baseSchemaOptions } from '../lib/schema-utils';

export interface DocumentDoc {
  ownerId: Types.ObjectId;
  title: string;
  documentType: DocumentType;
  version: number;
  /** Self-reference to the version this one supersedes. Null for a document's first version. */
  previousVersionId: Types.ObjectId | null;
  cloudinaryPublicId: string;
  cloudinaryUrl: string;
  /** Cloudinary's own resource_type ('image'|'raw'|'video') — needed for signed URLs/deletes. */
  cloudinaryResourceType: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  isCurrent: boolean;
  notes: string | null;
}

const schema = new Schema<DocumentDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    documentType: { type: String, enum: Object.values(DocumentType), default: DocumentType.OTHER },
    version: { type: Number, default: 1 },
    previousVersionId: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    cloudinaryPublicId: { type: String, required: true },
    cloudinaryUrl: { type: String, required: true },
    cloudinaryResourceType: { type: String, default: null },
    mimeType: { type: String, default: null },
    fileSizeBytes: { type: Number, default: null },
    isCurrent: { type: Boolean, default: true },
    notes: { type: String, default: null },
  },
  baseSchemaOptions,
);

export const Document = models.Document || model<DocumentDoc>('Document', schema);
