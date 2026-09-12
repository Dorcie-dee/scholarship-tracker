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
import { OpportunitySource } from './entities/opportunity-source.entity';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { CreateOpportunitySourceDto } from './dto/create-opportunity-source.dto';
import { UpdateOpportunitySourceDto } from './dto/update-opportunity-source.dto';
import { ListOpportunitySourcesQueryDto } from './dto/list-opportunity-sources-query.dto';
import { UrlFetchService } from '../common/http/url-fetch.service';
import { ContentOrigin } from '../types';

@Injectable()
export class OpportunitySourcesService {
  constructor(
    @InjectRepository(OpportunitySource)
    private readonly sources: Repository<OpportunitySource>,
    private readonly opportunitiesService: OpportunitiesService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly urlFetchService: UrlFetchService,
  ) {}

  async fetchPreview(url: string) {
    // Network I/O only — no DB transaction held open.
    return this.urlFetchService.fetchPreview(url);
  }

  async create(dto: CreateOpportunitySourceDto): Promise<OpportunitySource> {
    await this.opportunitiesService.findOneOrThrow(dto.opportunityId);

    const { autoFetch, ...fields } = dto;
    let contentOrigin = ContentOrigin.MANUAL;
    let sourceName = fields.sourceName;
    let extractedContent = fields.extractedContent;

    if (autoFetch) {
      if (!fields.sourceUrl) {
        throw new BadRequestException(
          'autoFetch requires a sourceUrl to fetch',
        );
      }
      // Fetch outside any transaction; only fill empty fields.
      const preview = await this.urlFetchService.fetchPreview(fields.sourceUrl);
      let filled = false;
      if (!extractedContent?.trim()) {
        extractedContent = preview.extractedContent;
        filled = true;
      }
      if (!sourceName?.trim() && preview.title) {
        sourceName = preview.title;
        filled = true;
      }
      if (filled) {
        contentOrigin = ContentOrigin.FETCHED;
      }
    }

    const entity = this.sources.create({
      ...fields,
      sourceName: sourceName ?? null,
      extractedContent: extractedContent ?? null,
      contentOrigin,
      capturedAt: fields.capturedAt ? new Date(fields.capturedAt) : new Date(),
      publishedAt: fields.publishedAt ? new Date(fields.publishedAt) : null,
    });
    return this.sources.save(entity);
  }

  /** Production hardening (Batch 4) — keyset-paginated, ordered by `(capturedAt, id)` DESC. */
  async findAll(
    query: ListOpportunitySourcesQueryDto,
  ): Promise<PaginatedResult<OpportunitySource>> {
    const { defaultPageSize, maxPageSize } = this.configService.get(
      'pagination',
      { infer: true },
    );
    const limit = resolvePageSize(query.limit, {
      defaultPageSize,
      maxPageSize,
    });
    const direction = query.order === 'asc' ? 'ASC' : 'DESC';

    const qb = this.sources.createQueryBuilder('source');
    if (query.opportunityId) {
      qb.andWhere('source.opportunityId = :opportunityId', {
        opportunityId: query.opportunityId,
      });
    }
    applyKeysetPagination(
      qb,
      'source.capturedAt',
      'source.id',
      direction,
      query.cursor ? decodeCursor(query.cursor) : undefined,
      limit,
    );

    const rows = await qb.getMany();
    return buildPaginatedResult(
      rows,
      limit,
      (r) => r.capturedAt.toISOString(),
      (r) => r.id,
    );
  }

  async findOneOrThrow(id: string): Promise<OpportunitySource> {
    const source = await this.sources.findOne({ where: { id } });
    if (!source) {
      throw new NotFoundException('Opportunity source not found');
    }
    return source;
  }

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
