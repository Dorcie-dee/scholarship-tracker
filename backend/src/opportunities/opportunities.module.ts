import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Opportunity } from './entities/opportunity.entity';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesController } from './opportunities.controller';
import { UniversitiesModule } from '../universities/universities.module';
import { ProgrammesModule } from '../programmes/programmes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Opportunity]),
    // Confirmed no reverse dependency: neither UniversitiesModule nor
    // ProgrammesModule imports OpportunitiesModule (ProgrammesModule only
    // imports UniversitiesModule) — no circular dependency, no forwardRef()
    // needed. Needed for F1/F2's relationship validation — see
    // opportunities.service.ts.
    UniversitiesModule,
    ProgrammesModule,
  ],
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
