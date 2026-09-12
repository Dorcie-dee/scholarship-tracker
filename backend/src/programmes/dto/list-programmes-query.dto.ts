import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

export class ListProgrammesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  universityId?: string;
}
