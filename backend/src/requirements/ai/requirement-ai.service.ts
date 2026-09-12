import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppConfig } from '../../config/configuration';
import { Requirement } from '../entities/requirement.entity';
import { RequirementsService } from '../requirements.service';
import { ProfileService } from '../../profile/profile.service';
import { RequirementStatus } from '../../types';
import {
  REQUIREMENT_AI_PROVIDER,
  type RequirementAiProvider,
} from './requirement-ai-provider.interface';

const AUTHORITATIVE_STATUSES = new Set<RequirementStatus>([
  RequirementStatus.CONFIRMED,
  RequirementStatus.NOT_MET,
  RequirementStatus.NOT_APPLICABLE,
]);

/**
 * Orchestrates AI suggestions without mutating authoritative status until
 * the user explicitly confirms. Provider calls happen outside DB transactions.
 */
@Injectable()
export class RequirementAiService {
  constructor(
    @InjectRepository(Requirement)
    private readonly requirements: Repository<Requirement>,
    private readonly requirementsService: RequirementsService,
    private readonly profileService: ProfileService,
    @Inject(REQUIREMENT_AI_PROVIDER)
    private readonly provider: RequirementAiProvider,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly dataSource: DataSource,
  ) {}

  async suggest(userId: string, requirementId: string): Promise<Requirement> {
    const { enabled, timeoutMs } = this.configService.get('requirementAi', {
      infer: true,
    });
    if (!enabled) {
      throw new ServiceUnavailableException(
        'Requirement AI suggestions are disabled',
      );
    }

    const requirement = await this.requirementsService.findOneAccessible(
      requirementId,
      userId,
    );
    if (!requirement.applicationId) {
      throw new BadRequestException(
        'Only application requirements can receive AI suggestions',
      );
    }

    if (AUTHORITATIVE_STATUSES.has(requirement.status)) {
      throw new ConflictException(
        'This requirement already has a confirmed status; clear or change it before requesting a new suggestion',
      );
    }

    const profile = await this.profileService.getByUserId(userId);
    const input = {
      requirementType: requirement.requirementType,
      description: requirement.description,
      currentStatus: requirement.status,
      profileSignals: {
        hasNationality: Boolean(profile.nationality),
        hasSummary: Boolean(profile.summary),
        educationCount: profile.education?.length ?? 0,
        experienceCount: profile.experience?.length ?? 0,
        skillCount: profile.skills?.length ?? 0,
        languageCount: profile.languages?.length ?? 0,
        certificationCount: profile.certifications?.length ?? 0,
        nationalityHint: profile.nationality ?? undefined,
        languageHints: (profile.languages ?? [])
          .map((l) => {
            const raw = l.language ?? l.name;
            return typeof raw === 'string' ? raw.trim() : '';
          })
          .filter(Boolean)
          .slice(0, 10),
      },
    };

    let result;
    try {
      result = await Promise.race([
        this.provider.suggest(input),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new ServiceUnavailableException('AI suggestion timed out'),
              ),
            timeoutMs,
          ),
        ),
      ]);
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new ServiceUnavailableException(
        'AI suggestion failed; your requirement status was not changed',
      );
    }

    if (!Object.values(RequirementStatus).includes(result.suggestedStatus)) {
      throw new ServiceUnavailableException(
        'AI provider returned an invalid status; nothing was saved',
      );
    }

    const rationale = (result.rationale ?? '').trim().slice(0, 1000);
    if (!rationale) {
      throw new ServiceUnavailableException(
        'AI provider returned an empty rationale; nothing was saved',
      );
    }

    // Persist suggestion only — never touch authoritative status here.
    requirement.suggestedStatus = result.suggestedStatus;
    requirement.suggestedAt = new Date();
    requirement.suggestionRationale = rationale;
    requirement.suggestionSource = result.source;
    return this.requirements.save(requirement);
  }

  async confirm(userId: string, requirementId: string): Promise<Requirement> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Requirement);
      // Ownership first (outside lock), then lock the row for confirm.
      await this.requirementsService.findOneAccessible(requirementId, userId);
      const requirement = await repo.findOne({
        where: { id: requirementId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!requirement?.suggestedStatus) {
        throw new ConflictException('No pending AI suggestion to confirm');
      }
      requirement.status = requirement.suggestedStatus;
      requirement.suggestedStatus = null;
      requirement.suggestedAt = null;
      requirement.suggestionRationale = null;
      requirement.suggestionSource = null;
      return repo.save(requirement);
    });
  }

  async reject(userId: string, requirementId: string): Promise<Requirement> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Requirement);
      await this.requirementsService.findOneAccessible(requirementId, userId);
      const requirement = await repo.findOne({
        where: { id: requirementId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!requirement) {
        throw new ConflictException('No pending AI suggestion to reject');
      }
      if (!requirement.suggestedStatus) {
        throw new ConflictException('No pending AI suggestion to reject');
      }
      // Authoritative status unchanged.
      requirement.suggestedStatus = null;
      requirement.suggestedAt = null;
      requirement.suggestionRationale = null;
      requirement.suggestionSource = null;
      return repo.save(requirement);
    });
  }
}
