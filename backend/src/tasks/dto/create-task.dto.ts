import { TaskDependencyType, TaskPriority, TaskStatus } from '../../types';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateTaskDto {
  /**
   * Every task belongs to a journey — this is what makes ownership
   * verifiable. If the task is really "about" a specific application or
   * requirement within that journey, also set applicationId/requirementId.
   */
  @IsUUID()
  journeyId: string;

  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsUUID()
  applicationId?: string;

  @IsOptional()
  @IsUUID()
  requirementId?: string;

  /**
   * Informational only — see task.entity.ts's doc comment. Never enforced as
   * a workflow blocker; validated for referential integrity and scope
   * consistency instead (see tasks.service.ts, Track 1 Group C / C2).
   *
   * Accepts `null` (in addition to a UUID or being omitted) so a PATCH can
   * explicitly clear an existing dependency — distinct from omitting the
   * field entirely, which means "leave it unchanged" (see UpdateTaskDto /
   * TasksService.update()'s C2.3 handling).
   */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  dependsOnTaskId?: string | null;

  @IsOptional()
  @IsEnum(TaskDependencyType)
  dependencyType?: TaskDependencyType;
}
