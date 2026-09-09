import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { OpportunityType, StudyLevel } from '../types';
import { Opportunity } from './entities/opportunity.entity';
import { UniversitiesService } from '../universities/universities.service';
import { ProgrammesService } from '../programmes/programmes.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';

export interface OpportunityFilters {
  studyLevel?: StudyLevel;
  country?: string;
  opportunityType?: OpportunityType;
  universityId?: string;
  programmeId?: string;
}

@Injectable()
export class OpportunitiesService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunities: Repository<Opportunity>,
    private readonly universitiesService: UniversitiesService,
    private readonly programmesService: ProgrammesService,
  ) {}

  /**
   * Group B / F1+F2 fix: previously neither create() nor update() validated
   * `universityId`/`programmeId` at all — an invalid id surfaced as a raw
   * FK-violation error instead of a clean 400/404 (unlike every sibling
   * service — ProgrammesService, RequirementsService, DeadlinesService,
   * OpportunitySourcesService all validate their FKs), and there was no
   * check at any layer that a supplied `programmeId` actually belongs to the
   * supplied `universityId` — an Opportunity could claim "Programme P at
   * University A" while P actually belongs to University B, silently wrong
   * catalog data. See docs/decisions.md.
   *
   * `current` is only passed by update() — needed to know the EFFECTIVE
   * university/programme (a field not present in `dto` means "unchanged",
   * not "cleared"; neither field is nullable through this DTO) so that
   * changing only one of the two still gets cross-checked against the
   * other's existing value.
   */
  private async validateRelationships(
    dto: Partial<CreateOpportunityDto>,
    current?: Opportunity,
  ): Promise<void> {
    const universityIdChanging = dto.universityId !== undefined;
    const programmeIdChanging = dto.programmeId !== undefined;

    const effectiveUniversityId = universityIdChanging
      ? dto.universityId
      : (current?.universityId ?? undefined);
    const effectiveProgrammeId = programmeIdChanging
      ? dto.programmeId
      : (current?.programmeId ?? undefined);

    // Independent of each other's result — run concurrently (same pattern
    // as Track 1's Checkpoint 5). The programme row is fetched whenever
    // EITHER it's newly being set this call (existence must be validated)
    // OR it will simply be in effect alongside a university this call
    // (needed for the cross-consistency check below, even if the programme
    // itself isn't the field changing) — never fetched twice for the same
    // call.
    const universityCheck = universityIdChanging
      ? this.universitiesService.findOneOrThrow(dto.universityId as string)
      : Promise.resolve(undefined);
    const needsProgrammeRow =
      programmeIdChanging ||
      (Boolean(effectiveProgrammeId) && Boolean(effectiveUniversityId));
    const programmeCheck = needsProgrammeRow
      ? this.programmesService.findOneOrThrow(effectiveProgrammeId as string)
      : Promise.resolve(undefined);

    const [, programme] = await Promise.all([universityCheck, programmeCheck]);

    if (
      programme &&
      effectiveUniversityId &&
      programme.universityId !== effectiveUniversityId
    ) {
      throw new BadRequestException(
        'The specified programmeId does not belong to the specified universityId',
      );
    }
  }

  async create(dto: CreateOpportunityDto): Promise<Opportunity> {
    await this.validateRelationships(dto);
    return this.opportunities.save(this.opportunities.create(dto));
  }

  /**
   * Group B / F7 fix: previously always eager-loaded sources/requirements/
   * deadlines for every row, unconditionally — an unbounded, self-documented
   * (docs/decisions.md) over-fetch for a view that doesn't render that
   * detail. Relations now belong only to `findOneWithDetailsOrThrow`, the
   * actual detail view (GET /opportunities/:id) — same split already
   * established between findOneOrThrow/findOneWithDetailsOrThrow for the
   * single-row case, now applied consistently to the list case too.
   */
  findAll(filters: OpportunityFilters): Promise<Opportunity[]> {
    const where: FindOptionsWhere<Opportunity> = {};
    if (filters.studyLevel) where.studyLevel = filters.studyLevel;
    if (filters.country) where.country = filters.country;
    if (filters.opportunityType)
      where.opportunityType = filters.opportunityType;
    if (filters.universityId) where.universityId = filters.universityId;
    if (filters.programmeId) where.programmeId = filters.programmeId;

    return this.opportunities.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Lean existence check — no relations loaded. Use this whenever the caller
   * only needs to confirm an opportunityId is valid (every FK-validation call
   * site: Applications/Requirements/Deadlines/OpportunitySources, plus this
   * service's own update/remove) or otherwise doesn't read
   * sources/requirements/deadlines. For the actual detail view, use
   * `findOneWithDetailsOrThrow` instead.
   */
  async findOneOrThrow(id: string): Promise<Opportunity> {
    const opportunity = await this.opportunities.findOne({ where: { id } });
    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }
    return opportunity;
  }

  /** Full detail load, including sources/requirements/deadlines — used by GET /opportunities/:id. */
  async findOneWithDetailsOrThrow(id: string): Promise<Opportunity> {
    const opportunity = await this.opportunities.findOne({
      where: { id },
      relations: { sources: true, requirements: true, deadlines: true },
    });
    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }
    return opportunity;
  }

  async update(id: string, dto: UpdateOpportunityDto): Promise<Opportunity> {
    const opportunity = await this.findOneOrThrow(id);
    await this.validateRelationships(dto, opportunity);
    Object.assign(opportunity, dto);
    return this.opportunities.save(opportunity);
  }

  async remove(id: string): Promise<void> {
    await this.findOneOrThrow(id);
    await this.opportunities.delete(id);
  }
}
