import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types';
import { ProgrammesService } from './programmes.service';
import { CreateProgrammeDto } from './dto/create-programme.dto';
import { UpdateProgrammeDto } from './dto/update-programme.dto';
import { ListProgrammesQueryDto } from './dto/list-programmes-query.dto';

/** Same read-open/mutation-ADMIN-only split as UniversitiesController — see its doc comment. */
@Controller('programmes')
export class ProgrammesController {
  constructor(private readonly programmesService: ProgrammesService) {}

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateProgrammeDto) {
    return this.programmesService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListProgrammesQueryDto) {
    return this.programmesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.programmesService.findOneOrThrow(id);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProgrammeDto) {
    return this.programmesService.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.programmesService.remove(id);
  }
}
