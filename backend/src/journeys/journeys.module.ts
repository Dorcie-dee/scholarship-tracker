import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationJourney } from './entities/application-journey.entity';
import { JourneysService } from './journeys.service';
import { JourneysController } from './journeys.controller';
import { UniversitiesModule } from '../universities/universities.module';
import { ProgrammesModule } from '../programmes/programmes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApplicationJourney]),
    UniversitiesModule,
    ProgrammesModule,
  ],
  controllers: [JourneysController],
  providers: [JourneysService],
  exports: [JourneysService],
})
export class JourneysModule {}
