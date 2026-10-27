import { z } from 'zod';
import { TaskDependencyType, TaskPriority, TaskStatus } from '../lib/enums';
import { FREE_TEXT_MAX_LENGTH } from '../lib/text-limits';
import { isoDateString, objectId, paginationQueryFields } from './common';

/**
 * Ported from `tasks/dto/create-task.dto.ts`. `dependsOnTaskId` accepts a
 * valid id, `null` (explicit clear on PATCH), or omission (unchanged) — same
 * `@ValidateIf` shape as the original.
 */
export const createTaskSchema = z
  .object({
    journeyId: objectId,
    title: z.string().trim().min(1).max(255),
    description: z.string().max(FREE_TEXT_MAX_LENGTH).optional(),
    status: z.nativeEnum(TaskStatus).optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    dueDate: isoDateString.optional(),
    applicationId: objectId.optional(),
    requirementId: objectId.optional(),
    dependsOnTaskId: objectId.nullable().optional(),
    dependencyType: z.nativeEnum(TaskDependencyType).optional(),
  })
  .strict();

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = createTaskSchema.partial().strict();

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const listTasksQuerySchema = z
  .object({
    journeyId: objectId.optional(),
    applicationId: objectId.optional(),
    order: z.enum(['asc', 'desc']).optional(),
    ...paginationQueryFields,
  })
  .strict();

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
