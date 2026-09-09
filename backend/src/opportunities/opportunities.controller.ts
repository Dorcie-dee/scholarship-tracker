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
import { OpportunityType, StudyLevel, UserRole } from '../types';
import { Roles } from '../auth/decorators/roles.decorator';
import { OpportunitiesService } from './opportunities.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';

/** Same read-open/mutation-ADMIN-only split as UniversitiesController — see its doc comment. */
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateOpportunityDto) {
    return this.opportunitiesService.create(dto);
  }

  @Get()
  findAll(
    @Query('studyLevel') studyLevel?: StudyLevel,
    @Query('country') country?: string,
    @Query('opportunityType') opportunityType?: OpportunityType,
    @Query('universityId') universityId?: string,
    @Query('programmeId') programmeId?: string,
  ) {
    return this.opportunitiesService.findAll({
      studyLevel,
      country,
      opportunityType,
      universityId,
      programmeId,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.opportunitiesService.findOneWithDetailsOrThrow(id);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOpportunityDto) {
    return this.opportunitiesService.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.opportunitiesService.remove(id);
  }
}
