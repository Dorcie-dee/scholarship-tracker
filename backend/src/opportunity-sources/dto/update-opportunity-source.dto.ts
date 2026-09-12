import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateOpportunitySourceDto } from './create-opportunity-source.dto';

/** Update never accepts autoFetch — that is create-only. */
export class UpdateOpportunitySourceDto extends PartialType(
  OmitType(CreateOpportunitySourceDto, ['autoFetch'] as const),
) {}
