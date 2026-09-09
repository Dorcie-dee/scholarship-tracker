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
import { UniversitiesService } from './universities.service';
import { CreateUniversityDto } from './dto/create-university.dto';
import { UpdateUniversityDto } from './dto/update-university.dto';

/**
 * Read access is unrestricted (any authenticated user — shared catalog
 * consumption, see docs/decisions.md, "Catalog data vs. owned data").
 * Mutation is ADMIN-only (shared catalog ADMINISTRATION) — see
 * docs/decisions.md, "RBAC dependency: why shared catalog administration
 * needed it now".
 */
@Controller('universities')
export class UniversitiesController {
  constructor(private readonly universitiesService: UniversitiesService) {}

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateUniversityDto) {
    return this.universitiesService.create(dto);
  }

  @Get()
  findAll(@Query('search') search?: string) {
    return this.universitiesService.findAll(search);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.universitiesService.findOneOrThrow(id);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUniversityDto) {
    return this.universitiesService.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.universitiesService.remove(id);
  }
}
