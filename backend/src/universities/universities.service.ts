import { Injectable, NotFoundException } from '@nestjs/common';
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
import { University } from './entities/university.entity';
import { CreateUniversityDto } from './dto/create-university.dto';
import { UpdateUniversityDto } from './dto/update-university.dto';
import { ListUniversitiesQueryDto } from './dto/list-universities-query.dto';

/**
 * Universities are shared reference/catalog data, not scoped to a single user
 * — see docs/decisions.md, "Catalog data vs. owned data". Any authenticated
 * user can read/create/edit them.
 */
@Injectable()
export class UniversitiesService {
  constructor(
    @InjectRepository(University)
    private readonly universities: Repository<University>,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  create(dto: CreateUniversityDto): Promise<University> {
    return this.universities.save(this.universities.create(dto));
  }

  /**
   * Production hardening (Batch 4) — keyset-paginated, ordered by `(name,
   * id)`. Previously returned the entire table unconditionally — a genuine
   * production gap for a catalog table expected to grow (see
   * docs/decisions.md, "Catalog pagination"). `search` still supports a
   * leading-wildcard `ILIKE` (unavoidable for substring search without a
   * trigram index — not added here, no evidence yet that this specific
   * query is a real bottleneck at current catalog size) and composes with
   * the cursor exactly as before with any other filter.
   */
  async findAll(
    query: ListUniversitiesQueryDto,
  ): Promise<PaginatedResult<University>> {
    const { defaultPageSize, maxPageSize } = this.configService.get(
      'pagination',
      { infer: true },
    );
    const limit = resolvePageSize(query.limit, {
      defaultPageSize,
      maxPageSize,
    });
    const direction = query.order === 'desc' ? 'DESC' : 'ASC';

    const qb = this.universities.createQueryBuilder('university');
    if (query.search) {
      qb.andWhere('university.name ILIKE :search', {
        search: `%${query.search}%`,
      });
    }
    applyKeysetPagination(
      qb,
      'university.name',
      'university.id',
      direction,
      query.cursor ? decodeCursor(query.cursor) : undefined,
      limit,
    );

    const rows = await qb.getMany();
    return buildPaginatedResult(
      rows,
      limit,
      (r) => r.name,
      (r) => r.id,
    );
  }

  async findOneOrThrow(id: string): Promise<University> {
    const university = await this.universities.findOne({ where: { id } });
    if (!university) {
      throw new NotFoundException('University not found');
    }
    return university;
  }

  async update(id: string, dto: UpdateUniversityDto): Promise<University> {
    const university = await this.findOneOrThrow(id);
    Object.assign(university, dto);
    return this.universities.save(university);
  }

  async remove(id: string): Promise<void> {
    await this.findOneOrThrow(id);
    await this.universities.delete(id);
  }
}
