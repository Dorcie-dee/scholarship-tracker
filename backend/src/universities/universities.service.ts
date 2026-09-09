import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { University } from './entities/university.entity';
import { CreateUniversityDto } from './dto/create-university.dto';
import { UpdateUniversityDto } from './dto/update-university.dto';

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
  ) {}

  create(dto: CreateUniversityDto): Promise<University> {
    return this.universities.save(this.universities.create(dto));
  }

  findAll(search?: string): Promise<University[]> {
    return this.universities.find({
      where: search ? { name: ILike(`%${search}%`) } : {},
      order: { name: 'ASC' },
    });
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
