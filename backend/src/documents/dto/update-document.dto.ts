import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Metadata-only edits. To change the file content, upload a new version instead. */
export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
