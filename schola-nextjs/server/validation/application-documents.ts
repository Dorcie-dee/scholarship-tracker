import { z } from 'zod';
import { objectIdField } from './common';

/** Ported from `applications/dto/attach-document.dto.ts`. */
export const attachDocumentSchema = z
  .object({
    documentId: objectIdField('documentId'),
    label: z.string().max(255).optional(),
  })
  .strict();

export type AttachDocumentInput = z.infer<typeof attachDocumentSchema>;
