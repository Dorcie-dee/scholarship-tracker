import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Programme } from './entities/programme.entity';
import { ProgrammesService } from './programmes.service';
import { ProgrammesController } from './programmes.controller';
import { UniversitiesModule } from '../universities/universities.module';

@Module({
  imports: [TypeOrmModule.forFeature([Programme]), UniversitiesModule],
  controllers: [ProgrammesController],
  providers: [ProgrammesService],
  exports: [ProgrammesService],
})
export class ProgrammesModule {}
