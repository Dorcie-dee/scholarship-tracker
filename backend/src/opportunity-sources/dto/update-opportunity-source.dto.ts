import { PartialType } from '@nestjs/mapped-types';
import { CreateOpportunitySourceDto } from './create-opportunity-source.dto';

export class UpdateOpportunitySourceDto extends PartialType(
  CreateOpportunitySourceDto,
) {}
