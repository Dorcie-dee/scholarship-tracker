import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpportunitySource } from './entities/opportunity-source.entity';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { CreateOpportunitySourceDto } from './dto/create-opportunity-source.dto';
import { UpdateOpportunitySourceDto } from './dto/update-opportunity-source.dto';

@Injectable()
export class OpportunitySourcesService {
  constructor(
    @InjectRepository(OpportunitySource)
    private readonly sources: Repository<OpportunitySource>,
    private readonly opportunitiesService: OpportunitiesService,
  ) {}

  async create(dto: CreateOpportunitySourceDto): Promise<OpportunitySource> {
    await this.opportunitiesService.findOneOrThrow(dto.opportunityId);
    const entity = this.sources.create({
      ...dto,
      capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : new Date(),
      publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null,
    });
    return this.sources.save(entity);
  }

  findAll(opportunityId?: string): Promise<OpportunitySource[]> {
    return this.sources.find({
      where: opportunityId ? { opportunityId } : {},
      order: { capturedAt: 'DESC' },
    });
  }

  async findOneOrThrow(id: string): Promise<OpportunitySource> {
    const source = await this.sources.findOne({ where: { id } });
    if (!source) {
      throw new NotFoundException('Opportunity source not found');
    }
    return source;
  }

  /**
   * Group B / F3 fix: previously did not validate a changed `opportunityId`
   * at all — unlike create() (and every sibling Group B service's own
   * update()), so an invalid id would 500 rather than 404, and a *valid but
   * different* opportunity id would silently succeed, re-parenting a
   * source's provenance record to an unrelated opportunity. See
   * docs/decisions.md for the reasoning kept vs. an alternative (making
   * `opportunityId` immutable after creation) — validating it, not locking
   * it, was chosen as the minimal fix consistent with every sibling
   * service's existing pattern.
   */
  async update(
    id: string,
    dto: UpdateOpportunitySourceDto,
  ): Promise<OpportunitySource> {
    const source = await this.findOneOrThrow(id);
    if (dto.opportunityId) {
      await this.opportunitiesService.findOneOrThrow(dto.opportunityId);
    }
    Object.assign(source, {
      ...dto,
      capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : source.capturedAt,
      publishedAt:
        dto.publishedAt !== undefined
          ? dto.publishedAt
            ? new Date(dto.publishedAt)
            : null
          : source.publishedAt,
    });
    return this.sources.save(source);
  }

  async remove(id: string): Promise<void> {
    await this.findOneOrThrow(id);
    await this.sources.delete(id);
  }
}
