import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpportunitySource } from './entities/opportunity-source.entity';
import { OpportunitySourcesService } from './opportunity-sources.service';
import { OpportunitySourcesController } from './opportunity-sources.controller';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { UrlFetchModule } from '../common/http/url-fetch.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OpportunitySource]),
    OpportunitiesModule,
    UrlFetchModule,
  ],
  controllers: [OpportunitySourcesController],
  providers: [OpportunitySourcesService],
  exports: [OpportunitySourcesService],
})
export class OpportunitySourcesModule {}
