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
import { OpportunitySourcesService } from './opportunity-sources.service';
import { CreateOpportunitySourceDto } from './dto/create-opportunity-source.dto';
import { UpdateOpportunitySourceDto } from './dto/update-opportunity-source.dto';

@Controller('opportunity-sources')
export class OpportunitySourcesController {
  constructor(private readonly sourcesService: OpportunitySourcesService) {}

  @Post()
  create(@Body() dto: CreateOpportunitySourceDto) {
    return this.sourcesService.create(dto);
  }

  @Get()
  findAll(@Query('opportunityId') opportunityId?: string) {
    return this.sourcesService.findAll(opportunityId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sourcesService.findOneOrThrow(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOpportunitySourceDto) {
    return this.sourcesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.sourcesService.remove(id);
  }
}
