import { DocumentType } from '../../types';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Metadata accompanying a multipart file upload — see documents.controller.ts. */
export class CreateDocumentDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  @IsOptional()
  @IsString()
  notes?: string;
}
