import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import {
  RequirementStatus,
  RequirementSuggestionSource,
  RequirementType,
} from '../../types';
import { RequirementAiService } from './requirement-ai.service';

describe('RequirementAiService', () => {
  let requirements: any;
  let requirementsService: any;
  let profileService: any;
  let provider: any;
  let configService: any;
  let dataSource: any;
  let service: RequirementAiService;

  const requirement = {
    id: 'req-1',
    applicationId: 'app-1',
    requirementType: RequirementType.LANGUAGE,
    description: 'English proficiency',
    status: RequirementStatus.UNKNOWN,
    suggestedStatus: null,
    suggestedAt: null,
    suggestionRationale: null,
    suggestionSource: null,
  };

  beforeEach(() => {
    requirements = {
      save: jest.fn(async (row: any) => row),
      findOne: jest.fn(),
    };
    requirementsService = {
      findOneAccessible: jest.fn(async () => ({ ...requirement })),
    };
    profileService = {
      getByUserId: jest.fn(async () => ({
        nationality: null,
        summary: null,
        education: [],
        experience: [],
        skills: [],
        certifications: [],
        languages: [{ language: 'English' }],
      })),
    };
    provider = {
      suggest: jest.fn(async () => ({
        suggestedStatus: RequirementStatus.PROFILE_MATCH,
        rationale: 'Language matches profile.',
        source: RequirementSuggestionSource.HEURISTIC,
      })),
    };
    configService = {
      get: jest.fn(() => ({
        enabled: true,
        timeoutMs: 2000,
        provider: 'heuristic',
      })),
    };
    dataSource = {
      transaction: jest.fn(async (fn: any) =>
        fn({ getRepository: () => requirements }),
      ),
    };
    service = new RequirementAiService(
      requirements,
      requirementsService,
      profileService,
      provider,
      configService,
      dataSource,
    );
  });

  it('persists a suggestion without changing authoritative status', async () => {
    const result = await service.suggest('user-1', 'req-1');
    expect(result.status).toBe(RequirementStatus.UNKNOWN);
    expect(result.suggestedStatus).toBe(RequirementStatus.PROFILE_MATCH);
    expect(result.suggestionRationale).toContain('Language');
    expect(provider.suggest).toHaveBeenCalled();
  });

  it('refuses to suggest over a confirmed status', async () => {
    requirementsService.findOneAccessible.mockResolvedValueOnce({
      ...requirement,
      status: RequirementStatus.CONFIRMED,
    });
    await expect(service.suggest('user-1', 'req-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('confirm copies suggestion into status and clears suggestion fields', async () => {
    requirements.findOne.mockResolvedValueOnce({
      ...requirement,
      suggestedStatus: RequirementStatus.PROFILE_MATCH,
      suggestionRationale: 'ok',
      suggestionSource: RequirementSuggestionSource.HEURISTIC,
    });
    const result = await service.confirm('user-1', 'req-1');
    expect(result.status).toBe(RequirementStatus.PROFILE_MATCH);
    expect(result.suggestedStatus).toBeNull();
  });

  it('reject clears suggestion and leaves status unchanged', async () => {
    requirements.findOne.mockResolvedValueOnce({
      ...requirement,
      status: RequirementStatus.UNKNOWN,
      suggestedStatus: RequirementStatus.AI_ASSESSMENT,
      suggestionRationale: 'maybe',
      suggestionSource: RequirementSuggestionSource.HEURISTIC,
    });
    const result = await service.reject('user-1', 'req-1');
    expect(result.status).toBe(RequirementStatus.UNKNOWN);
    expect(result.suggestedStatus).toBeNull();
  });

  it('returns 503 when AI is disabled', async () => {
    configService.get.mockReturnValueOnce({
      enabled: false,
      timeoutMs: 2000,
      provider: 'heuristic',
    });
    await expect(service.suggest('user-1', 'req-1')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
