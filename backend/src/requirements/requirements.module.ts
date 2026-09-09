import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Requirement } from './entities/requirement.entity';
import { RequirementsService } from './requirements.service';
import { RequirementsController } from './requirements.controller';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { ApplicationsModule } from '../applications/applications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Requirement]),
    OpportunitiesModule,
    ApplicationsModule,
  ],
  controllers: [RequirementsController],
  providers: [RequirementsService],
  exports: [RequirementsService],
})
export class RequirementsModule {}
