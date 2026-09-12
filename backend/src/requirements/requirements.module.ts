import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Requirement } from './entities/requirement.entity';
import { RequirementsService } from './requirements.service';
import { RequirementsController } from './requirements.controller';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { ApplicationsModule } from '../applications/applications.module';
import { ProfileModule } from '../profile/profile.module';
import { RequirementAiService } from './ai/requirement-ai.service';
import { HeuristicRequirementAiProvider } from './ai/heuristic-requirement-ai.provider';
import { REQUIREMENT_AI_PROVIDER } from './ai/requirement-ai-provider.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([Requirement]),
    OpportunitiesModule,
    ApplicationsModule,
    ProfileModule,
  ],
  controllers: [RequirementsController],
  providers: [
    RequirementsService,
    RequirementAiService,
    HeuristicRequirementAiProvider,
    {
      provide: REQUIREMENT_AI_PROVIDER,
      useExisting: HeuristicRequirementAiProvider,
    },
  ],
  exports: [RequirementsService],
})
export class RequirementsModule {}
