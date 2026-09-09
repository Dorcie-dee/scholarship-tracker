import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Deliberately permissive: education/experience/skills/etc. are jsonb arrays
 * (see applicant-profile.entity.ts's doc comment) rather than fully modeled
 * DTOs per sub-field, so this DTO only validates the outer shape. Consumers
 * (frontend forms) are responsible for the inner shape of each array item.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsArray()
  education?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  experience?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  skills?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  certifications?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  languages?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
