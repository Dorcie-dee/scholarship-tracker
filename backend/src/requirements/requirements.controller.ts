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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { RequirementsService } from './requirements.service';
import { RequirementAiService } from './ai/requirement-ai.service';
import { CreateRequirementDto } from './dto/create-requirement.dto';
import { UpdateRequirementDto } from './dto/update-requirement.dto';
import { ListRequirementsQueryDto } from './dto/list-requirements-query.dto';
import { StrictRateLimit } from '../common/decorators/strict-rate-limit.decorator';

@Controller('requirements')
export class RequirementsController {
  constructor(
    private readonly requirementsService: RequirementsService,
    private readonly requirementAiService: RequirementAiService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRequirementDto,
  ) {
    return this.requirementsService.create(user.userId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListRequirementsQueryDto,
  ) {
    return this.requirementsService.findAll(
      user.userId,
      {
        opportunityId: query.opportunityId,
        applicationId: query.applicationId,
      },
      query,
    );
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requirementsService.findOneAccessible(id, user.userId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRequirementDto,
  ) {
    return this.requirementsService.update(id, user.userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.requirementsService.remove(id, user.userId);
  }

  /** AI suggests only — never mutates authoritative status. */
  @Post(':id/ai-suggestion')
  @StrictRateLimit()
  suggestAi(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requirementAiService.suggest(user.userId, id);
  }

  @Post(':id/ai-suggestion/confirm')
  confirmAi(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requirementAiService.confirm(user.userId, id);
  }

  @Post(':id/ai-suggestion/reject')
  rejectAi(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requirementAiService.reject(user.userId, id);
  }
}
