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
import { Programme } from './entities/programme.entity';
import { UniversitiesService } from '../universities/universities.service';
import { CreateProgrammeDto } from './dto/create-programme.dto';
import { UpdateProgrammeDto } from './dto/update-programme.dto';
import { ListProgrammesQueryDto } from './dto/list-programmes-query.dto';

@Injectable()
export class ProgrammesService {
  constructor(
    @InjectRepository(Programme)
    private readonly programmes: Repository<Programme>,
    private readonly universitiesService: UniversitiesService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async create(dto: CreateProgrammeDto): Promise<Programme> {
    await this.universitiesService.findOneOrThrow(dto.universityId);
    return this.programmes.save(this.programmes.create(dto));
  }

  /** Production hardening (Batch 4) — keyset-paginated, ordered by `(name, id)`. See UniversitiesService.findAll()'s doc comment for the general reasoning. */
  async findAll(
    query: ListProgrammesQueryDto,
  ): Promise<PaginatedResult<Programme>> {
    const { defaultPageSize, maxPageSize } = this.configService.get(
      'pagination',
      { infer: true },
    );
    const limit = resolvePageSize(query.limit, {
      defaultPageSize,
      maxPageSize,
    });
    const direction = query.order === 'desc' ? 'DESC' : 'ASC';

    const qb = this.programmes.createQueryBuilder('programme');
    if (query.universityId) {
      qb.andWhere('programme.universityId = :universityId', {
        universityId: query.universityId,
      });
    }
    applyKeysetPagination(
      qb,
      'programme.name',
      'programme.id',
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

  async findOneOrThrow(id: string): Promise<Programme> {
    const programme = await this.programmes.findOne({ where: { id } });
    if (!programme) {
      throw new NotFoundException('Programme not found');
    }
    return programme;
  }

  async update(id: string, dto: UpdateProgrammeDto): Promise<Programme> {
    const programme = await this.findOneOrThrow(id);
    if (dto.universityId) {
      await this.universitiesService.findOneOrThrow(dto.universityId);
    }
    Object.assign(programme, dto);
    return this.programmes.save(programme);
  }

  async remove(id: string): Promise<void> {
    await this.findOneOrThrow(id);
    await this.programmes.delete(id);
  }
}
