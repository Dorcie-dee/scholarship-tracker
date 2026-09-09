import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async findAll(
    userId: string,
    filters: { opportunityId?: string; applicationId?: string },
  ): Promise<Requirement[]> {
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
    return this.requirements.find({
      where: {
        ...(filters.opportunityId
          ? { opportunityId: filters.opportunityId }
          : {}),
        ...(filters.applicationId
          ? { applicationId: filters.applicationId }
          : {}),
      },
      order: { createdAt: 'ASC' },
    });
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
