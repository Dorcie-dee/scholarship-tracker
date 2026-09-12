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
import { ListOpportunitySourcesQueryDto } from './dto/list-opportunity-sources-query.dto';
import { FetchUrlPreviewDto } from './dto/fetch-url-preview.dto';
import { StrictRateLimit } from '../common/decorators/strict-rate-limit.decorator';

@Controller('opportunity-sources')
export class OpportunitySourcesController {
  constructor(private readonly sourcesService: OpportunitySourcesService) {}

  /**
   * Preview a public URL for capture — SSRF-hardened, rate-limited.
   * Does not create an OpportunitySource or Opportunity.
   */
  @Post('fetch-preview')
  @StrictRateLimit()
  fetchPreview(@Body() dto: FetchUrlPreviewDto) {
    return this.sourcesService.fetchPreview(dto.url);
  }

  @Post()
  @StrictRateLimit()
  create(@Body() dto: CreateOpportunitySourceDto) {
    return this.sourcesService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListOpportunitySourcesQueryDto) {
    return this.sourcesService.findAll(query);
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
