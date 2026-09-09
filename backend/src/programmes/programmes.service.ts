import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Programme } from './entities/programme.entity';
import { UniversitiesService } from '../universities/universities.service';
import { CreateProgrammeDto } from './dto/create-programme.dto';
import { UpdateProgrammeDto } from './dto/update-programme.dto';

@Injectable()
export class ProgrammesService {
  constructor(
    @InjectRepository(Programme)
    private readonly programmes: Repository<Programme>,
    private readonly universitiesService: UniversitiesService,
  ) {}

  async create(dto: CreateProgrammeDto): Promise<Programme> {
    await this.universitiesService.findOneOrThrow(dto.universityId);
    return this.programmes.save(this.programmes.create(dto));
  }

  findAll(universityId?: string): Promise<Programme[]> {
    return this.programmes.find({
      where: universityId ? { universityId } : {},
      order: { name: 'ASC' },
    });
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
