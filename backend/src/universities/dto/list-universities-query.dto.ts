import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { SHORT_TEXT_MAX_LENGTH } from '../../common/validators/text-limits';

export class ListUniversitiesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  search?: string;
}
