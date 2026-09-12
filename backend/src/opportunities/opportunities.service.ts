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
import { Opportunity } from './entities/opportunity.entity';
import { UniversitiesService } from '../universities/universities.service';
import { ProgrammesService } from '../programmes/programmes.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { ListOpportunitiesQueryDto } from './dto/list-opportunities-query.dto';

@Injectable()
export class OpportunitiesService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunities: Repository<Opportunity>,
    private readonly universitiesService: UniversitiesService,
    private readonly programmesService: ProgrammesService,
    private readonly configService: ConfigService<AppConfig, true>,
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
  /**
   * Production hardening (Batch 4) — keyset-paginated, ordered by
   * `(createdAt, id)` DESC (newest first, matching the original order).
   * Previously returned the entire filtered result set unconditionally.
   */
  async findAll(
    query: ListOpportunitiesQueryDto,
  ): Promise<PaginatedResult<Opportunity>> {
    const { defaultPageSize, maxPageSize } = this.configService.get(
      'pagination',
      { infer: true },
    );
    const limit = resolvePageSize(query.limit, {
      defaultPageSize,
      maxPageSize,
    });
    const direction = query.order === 'asc' ? 'ASC' : 'DESC';

    const qb = this.opportunities.createQueryBuilder('opportunity');
    if (query.studyLevel) {
      qb.andWhere('opportunity.studyLevel = :studyLevel', {
        studyLevel: query.studyLevel,
      });
    }
    if (query.country) {
      qb.andWhere('opportunity.country = :country', {
        country: query.country,
      });
    }
    if (query.opportunityType) {
      qb.andWhere('opportunity.opportunityType = :opportunityType', {
        opportunityType: query.opportunityType,
      });
    }
    if (query.universityId) {
      qb.andWhere('opportunity.universityId = :universityId', {
        universityId: query.universityId,
      });
    }
    if (query.programmeId) {
      qb.andWhere('opportunity.programmeId = :programmeId', {
        programmeId: query.programmeId,
      });
    }
    applyKeysetPagination(
      qb,
      'opportunity.createdAt',
      'opportunity.id',
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
