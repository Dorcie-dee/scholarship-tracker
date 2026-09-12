import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

export class ListOpportunitySourcesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  opportunityId?: string;
}
