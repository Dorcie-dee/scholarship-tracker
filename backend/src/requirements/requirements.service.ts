import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AppConfig } from '../config/configuration';
import {
  applyKeysetPagination,
  buildPaginatedResult,
  decodeCursor,
  PaginatedResult,
  resolvePageSize,
} from '../common/pagination/cursor';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { Requirement } from './entities/requirement.entity';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { ApplicationsService } from '../applications/applications.service';
import { CreateRequirementDto } from './dto/create-requirement.dto';
import { UpdateRequirementDto } from './dto/update-requirement.dto';

/**
 * A Requirement can be scoped to an Opportunity (shared catalog data — no
 * ownership check needed), an Application (user-owned — ownership enforced via
 * ApplicationsService), or both. See requirement.entity.ts's doc comment for
 * why this is two independent nullable FKs rather than a stricter model.
 */
@Injectable()
export class RequirementsService {
  constructor(
    @InjectRepository(Requirement)
    private readonly requirements: Repository<Requirement>,
    private readonly opportunitiesService: OpportunitiesService,
    private readonly applicationsService: ApplicationsService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async create(
    userId: string,
    dto: CreateRequirementDto,
  ): Promise<Requirement> {
    if (!dto.opportunityId && !dto.applicationId) {
      throw new BadRequestException(
        'A requirement must be linked to an opportunityId and/or applicationId',
      );
    }
    if (dto.opportunityId) {
      await this.opportunitiesService.findOneOrThrow(dto.opportunityId);
    }
    if (dto.applicationId) {
      await this.applicationsService.assertApplicationOwnedByUser(
        dto.applicationId,
        userId,
      );
    }
    return this.requirements.save(this.requirements.create(dto));
  }

  /** Production hardening (Batch 4) — keyset-paginated, ordered by `(createdAt, id)`. Always scoped to at least one parent (unchanged) — see DeadlinesService.findAll()'s analogous comment on why pagination still applies. */
  async findAll(
    userId: string,
    filters: { opportunityId?: string; applicationId?: string },
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<Requirement>> {
    if (!filters.opportunityId && !filters.applicationId) {
      throw new BadRequestException(
        'Provide opportunityId and/or applicationId to list requirements',
      );
    }
    if (filters.applicationId) {
      await this.applicationsService.assertApplicationOwnedByUser(
        filters.applicationId,
        userId,
      );
    }

    const { defaultPageSize, maxPageSize } = this.configService.get(
      'pagination',
      { infer: true },
    );
    const limit = resolvePageSize(query.limit, {
      defaultPageSize,
      maxPageSize,
    });
    const direction = query.order === 'desc' ? 'DESC' : 'ASC';

    const qb = this.requirements.createQueryBuilder('requirement');
    if (filters.opportunityId) {
      qb.andWhere('requirement.opportunityId = :opportunityId', {
        opportunityId: filters.opportunityId,
      });
    }
    if (filters.applicationId) {
      qb.andWhere('requirement.applicationId = :applicationId', {
        applicationId: filters.applicationId,
      });
    }
    applyKeysetPagination(
      qb,
      'requirement.createdAt',
      'requirement.id',
      direction,
      query.cursor ? decodeCursor(query.cursor) : undefined,
      limit,
    );

    const rows = await qb.getMany();
    return buildPaginatedResult(
      rows,
      limit,
      (r) => r.createdAt.toISOString(),
      (r) => r.id,
    );
  }

  private async findEntityOrThrow(id: string): Promise<Requirement> {
    const requirement = await this.requirements.findOne({ where: { id } });
    if (!requirement) {
      throw new NotFoundException('Requirement not found');
    }
    return requirement;
  }

  async findOneAccessible(id: string, userId: string): Promise<Requirement> {
    const requirement = await this.findEntityOrThrow(id);
    if (requirement.applicationId) {
      await this.applicationsService.assertApplicationOwnedByUser(
        requirement.applicationId,
        userId,
      );
    }
    return requirement;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateRequirementDto,
  ): Promise<Requirement> {
    const requirement = await this.findOneAccessible(id, userId);
    if (dto.opportunityId) {
      await this.opportunitiesService.findOneOrThrow(dto.opportunityId);
    }
    if (dto.applicationId) {
      await this.applicationsService.assertApplicationOwnedByUser(
        dto.applicationId,
        userId,
      );
    }
    Object.assign(requirement, dto);
    return this.requirements.save(requirement);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOneAccessible(id, userId);
    await this.requirements.delete(id);
  }
}
