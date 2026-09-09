import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApplicationJourney } from './entities/application-journey.entity';
import { UniversitiesService } from '../universities/universities.service';
import { ProgrammesService } from '../programmes/programmes.service';
import { assertOwnership } from '../common/utils/ownership';
import { CreateJourneyDto } from './dto/create-journey.dto';
import { UpdateJourneyDto } from './dto/update-journey.dto';

/** Journeys are the top-level ownership boundary for a user's applications/tasks. */
@Injectable()
export class JourneysService {
  constructor(
    @InjectRepository(ApplicationJourney)
    private readonly journeys: Repository<ApplicationJourney>,
    private readonly universitiesService: UniversitiesService,
    private readonly programmesService: ProgrammesService,
  ) {}

  async create(
    userId: string,
    dto: CreateJourneyDto,
  ): Promise<ApplicationJourney> {
    // Independent checks — neither depends on the other's result — run
    // concurrently rather than one after another.
    await Promise.all([
      dto.universityId
        ? this.universitiesService.findOneOrThrow(dto.universityId)
        : Promise.resolve(undefined),
      dto.programmeId
        ? this.programmesService.findOneOrThrow(dto.programmeId)
        : Promise.resolve(undefined),
    ]);
    const journey = this.journeys.create({ ...dto, userId });
    return this.journeys.save(journey);
  }

  findAllForUser(userId: string): Promise<ApplicationJourney[]> {
    return this.journeys.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOneOrThrow(id: string): Promise<ApplicationJourney> {
    const journey = await this.journeys.findOne({ where: { id } });
    if (!journey) {
      throw new NotFoundException('Journey not found');
    }
    return journey;
  }

  async findOwnedOrThrow(
    id: string,
    userId: string,
  ): Promise<ApplicationJourney> {
    const journey = await this.findOneOrThrow(id);
    assertOwnership(journey.userId, userId);
    return journey;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateJourneyDto,
  ): Promise<ApplicationJourney> {
    const journey = await this.findOwnedOrThrow(id, userId);
    await Promise.all([
      dto.universityId
        ? this.universitiesService.findOneOrThrow(dto.universityId)
        : Promise.resolve(undefined),
      dto.programmeId
        ? this.programmesService.findOneOrThrow(dto.programmeId)
        : Promise.resolve(undefined),
    ]);
    Object.assign(journey, dto);
    return this.journeys.save(journey);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOwnedOrThrow(id, userId);
    await this.journeys.delete(id);
  }
}
