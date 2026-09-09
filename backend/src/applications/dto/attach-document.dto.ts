import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AttachDocumentDto {
  @IsUUID()
  documentId: string;

  /** Matches ApplicationDocument.label's varchar(255) column. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;
}
