import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from './entities/task.entity';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { JourneysModule } from '../journeys/journeys.module';
import { ApplicationsModule } from '../applications/applications.module';
import { RequirementsModule } from '../requirements/requirements.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task]),
    JourneysModule,
    ApplicationsModule,
    RequirementsModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
