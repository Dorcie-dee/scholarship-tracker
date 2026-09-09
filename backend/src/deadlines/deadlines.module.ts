import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Deadline } from './entities/deadline.entity';
import { DeadlinesService } from './deadlines.service';
import { DeadlinesController } from './deadlines.controller';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { ApplicationsModule } from '../applications/applications.module';
import { TasksModule } from '../tasks/tasks.module';
import { RequirementsModule } from '../requirements/requirements.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Deadline]),
    OpportunitiesModule,
    ApplicationsModule,
    TasksModule,
    RequirementsModule,
  ],
  controllers: [DeadlinesController],
  providers: [DeadlinesService],
  exports: [DeadlinesService],
})
export class DeadlinesModule {}
