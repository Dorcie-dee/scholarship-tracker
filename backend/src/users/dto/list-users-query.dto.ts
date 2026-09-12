import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserRole } from '../../types';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { SHORT_TEXT_MAX_LENGTH } from '../../common/validators/text-limits';
import { trim } from '../../common/validators/trim.transform';

export class ListUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  search?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
