import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';

/**
 * Covers the existence-check vs. full-detail-load split (see
 * opportunities.service.ts's doc comments), plus Track 1 Group B's F1/F2/F7
 * fixes: relationship validation on create/update (F1), the
 * University↔Programme cross-consistency check (F2), and findAll() no
 * longer eager-loading relations for every row (F7).
 */
describe('OpportunitiesService', () => {
  let opportunities: any;
  let universitiesService: any;
  let programmesService: any;
  let service: OpportunitiesService;

  beforeEach(() => {
    opportunities = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => ({ id: 'opportunity-1', ...row })),
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => ({ id: 'opportunity-1', title: 'Sample' })),
    };
    universitiesService = {
      findOneOrThrow: jest.fn(async (id: string) => ({ id })),
    };
    programmesService = {
      findOneOrThrow: jest.fn(async (id: string) => ({
        id,
        universityId: 'university-1',
      })),
    };
    service = new OpportunitiesService(
      opportunities,
      universitiesService,
      programmesService,
    );
  });

  describe('existence check vs. full detail load', () => {
    it('findOneOrThrow does not request relations', async () => {
      await service.findOneOrThrow('opportunity-1');

      expect(opportunities.findOne).toHaveBeenCalledWith({
        where: { id: 'opportunity-1' },
      });
    });

    it('findOneWithDetailsOrThrow requests sources/requirements/deadlines', async () => {
      await service.findOneWithDetailsOrThrow('opportunity-1');

      expect(opportunities.findOne).toHaveBeenCalledWith({
        where: { id: 'opportunity-1' },
        relations: { sources: true, requirements: true, deadlines: true },
      });
    });

    it('findOneOrThrow throws NotFoundException when nothing matches', async () => {
      opportunities.findOne.mockResolvedValueOnce(null);
      await expect(service.findOneOrThrow('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('findOneWithDetailsOrThrow throws NotFoundException when nothing matches', async () => {
      opportunities.findOne.mockResolvedValueOnce(null);
      await expect(
        service.findOneWithDetailsOrThrow('missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('update() uses the lean existence check, not the detail load', async () => {
      await service.update('opportunity-1', { title: 'Updated' });

      // Only one findOne call is made, and it must be the lean variant (no relations).
      expect(opportunities.findOne).toHaveBeenCalledTimes(1);
      expect(opportunities.findOne).toHaveBeenCalledWith({
        where: { id: 'opportunity-1' },
      });
    });
  });

  /** F7: findAll() previously eager-loaded sources/requirements/deadlines unconditionally. */
  describe('findAll — F7 fix', () => {
    it('does not request sources/requirements/deadlines relations', async () => {
      await service.findAll({});

      expect(opportunities.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          order: { createdAt: 'DESC' },
        }),
      );
      const [callArgs] = opportunities.find.mock.calls[0];
      expect(callArgs).not.toHaveProperty('relations');
    });

    it('applies filters when given', async () => {
      await service.findAll({ universityId: 'university-1' });
      expect(opportunities.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { universityId: 'university-1' },
        }),
      );
    });
  });

  /** F1: create()/update() previously performed zero relationship validation at all. */
  describe('create — F1 relationship validation', () => {
    it('creates without any relationship check when neither universityId nor programmeId is given', async () => {
      await service.create({ title: 'A scholarship' });

      expect(universitiesService.findOneOrThrow).not.toHaveBeenCalled();
      expect(programmesService.findOneOrThrow).not.toHaveBeenCalled();
      expect(opportunities.save).toHaveBeenCalled();
    });

    it('validates universityId exists', async () => {
      await service.create({
        title: 'A scholarship',
        universityId: 'university-1',
      });

      expect(universitiesService.findOneOrThrow).toHaveBeenCalledWith(
        'university-1',
      );
    });

    it('rejects when universityId does not exist, without creating the opportunity', async () => {
      universitiesService.findOneOrThrow.mockRejectedValueOnce(
        new NotFoundException('University not found'),
      );

      await expect(
        service.create({
          title: 'A scholarship',
          universityId: 'missing',
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(opportunities.save).not.toHaveBeenCalled();
    });

    it('validates universityId and programmeId concurrently, not sequentially', async () => {
      let universityResolved = false;
      universitiesService.findOneOrThrow.mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        universityResolved = true;
        return { id: 'university-1' };
      });
      programmesService.findOneOrThrow.mockImplementationOnce(async () => {
        // If these ran sequentially (university awaited first), this
        // assertion would fail — the university check hasn't finished yet
        // when this one is invoked, proving Promise.all-style concurrency.
        expect(universityResolved).toBe(false);
        return { id: 'programme-1', universityId: 'university-1' };
      });

      await service.create({
        title: 'A scholarship',
        universityId: 'university-1',
        programmeId: 'programme-1',
      });
    });

    /** F2: the actual cross-consistency check — the audit's specific concern. */
    it('F2 — rejects when programmeId does not belong to universityId', async () => {
      programmesService.findOneOrThrow.mockResolvedValueOnce({
        id: 'programme-1',
        universityId: 'university-OTHER',
      });

      await expect(
        service.create({
          title: 'A scholarship',
          universityId: 'university-1',
          programmeId: 'programme-1',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(opportunities.save).not.toHaveBeenCalled();
    });

    it('F2 — accepts when programmeId genuinely belongs to universityId', async () => {
      programmesService.findOneOrThrow.mockResolvedValueOnce({
        id: 'programme-1',
        universityId: 'university-1',
      });

      await service.create({
        title: 'A scholarship',
        universityId: 'university-1',
        programmeId: 'programme-1',
      });

      expect(opportunities.save).toHaveBeenCalled();
    });
  });

  describe('update — F1/F2 relationship validation', () => {
    it('does not re-validate universityId/programmeId when the update does not touch either', async () => {
      await service.update('opportunity-1', { title: 'New title' });

      expect(universitiesService.findOneOrThrow).not.toHaveBeenCalled();
      expect(programmesService.findOneOrThrow).not.toHaveBeenCalled();
    });

    it('validates a newly supplied programmeId against the EXISTING (unchanged) universityId', async () => {
      opportunities.findOne.mockResolvedValueOnce({
        id: 'opportunity-1',
        universityId: 'university-1',
        programmeId: null,
      });
      programmesService.findOneOrThrow.mockResolvedValueOnce({
        id: 'programme-1',
        universityId: 'university-OTHER',
      });

      await expect(
        service.update('opportunity-1', { programmeId: 'programme-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('validates the EXISTING (unchanged) programmeId against a newly supplied universityId', async () => {
      // The opportunity already has programmeId set (belonging to
      // university-1); changing ONLY universityId to something else must
      // still be caught, even though programmeId itself isn't in this dto.
      opportunities.findOne.mockResolvedValueOnce({
        id: 'opportunity-1',
        universityId: 'university-1',
        programmeId: 'programme-1',
      });
      programmesService.findOneOrThrow.mockResolvedValueOnce({
        id: 'programme-1',
        universityId: 'university-1', // programme's real, unchanged university
      });

      await expect(
        service.update('opportunity-1', { universityId: 'university-2' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows changing universityId when the opportunity has no programme to conflict with', async () => {
      opportunities.findOne.mockResolvedValueOnce({
        id: 'opportunity-1',
        universityId: 'university-1',
        programmeId: null,
      });

      await service.update('opportunity-1', { universityId: 'university-2' });

      expect(programmesService.findOneOrThrow).not.toHaveBeenCalled();
      expect(opportunities.save).toHaveBeenCalled();
    });
  });
});
