import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

export class ListApplicationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  journeyId?: string;
}
