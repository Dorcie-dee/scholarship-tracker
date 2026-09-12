import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

export class ListTasksQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  journeyId?: string;

  @IsOptional()
  @IsUUID()
  applicationId?: string;
}
