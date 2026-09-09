import { NotFoundException } from '@nestjs/common';
import { ProgrammesService } from './programmes.service';

/** Track 1 Group B — closes this service's previous zero-test-coverage gap. */
describe('ProgrammesService', () => {
  let programmes: any;
  let universitiesService: any;
  let service: ProgrammesService;

  beforeEach(() => {
    programmes = {
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn(async (row: any) => ({ id: 'programme-1', ...row })),
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      delete: jest.fn(async () => ({ affected: 1 })),
    };
    universitiesService = {
      findOneOrThrow: jest.fn(async (id: string) => ({
        id,
        name: 'University',
      })),
    };
    service = new ProgrammesService(programmes, universitiesService);
  });

  describe('create', () => {
    it('validates the university exists before creating the programme', async () => {
      const dto = {
        universityId: 'university-1',
        name: 'MSc Computer Science',
      };
      await service.create(dto);

      expect(universitiesService.findOneOrThrow).toHaveBeenCalledWith(
        'university-1',
      );
      expect(programmes.save).toHaveBeenCalled();
    });

    it('rejects when the university does not exist, without creating the programme', async () => {
      universitiesService.findOneOrThrow.mockRejectedValueOnce(
        new NotFoundException('University not found'),
      );

      await expect(
        service.create({
          universityId: 'missing',
          name: 'MSc Computer Science',
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(programmes.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('filters by universityId when given', async () => {
      await service.findAll('university-1');
      expect(programmes.find).toHaveBeenCalledWith({
        where: { universityId: 'university-1' },
        order: { name: 'ASC' },
      });
    });

    it('lists every programme when no filter is given', async () => {
      await service.findAll();
      expect(programmes.find).toHaveBeenCalledWith({
        where: {},
        order: { name: 'ASC' },
      });
    });
  });

  describe('update', () => {
    it('leaves universityId unvalidated (and unchanged) when the DTO does not touch it', async () => {
      programmes.findOne.mockResolvedValueOnce({
        id: 'programme-1',
        universityId: 'university-1',
        name: 'MSc Computer Science',
      });

      await service.update('programme-1', { name: 'MSc AI' });

      expect(universitiesService.findOneOrThrow).not.toHaveBeenCalled();
    });

    it('re-validates the university when universityId IS being changed — a Programme cannot be silently re-parented to a nonexistent university', async () => {
      programmes.findOne.mockResolvedValueOnce({
        id: 'programme-1',
        universityId: 'university-1',
        name: 'MSc Computer Science',
      });

      await service.update('programme-1', {
        universityId: 'university-2',
      });

      expect(universitiesService.findOneOrThrow).toHaveBeenCalledWith(
        'university-2',
      );
    });

    it('throws NotFoundException instead of creating a row when the programme is missing', async () => {
      await expect(
        service.update('missing', { name: 'MSc AI' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(programmes.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an existing programme', async () => {
      programmes.findOne.mockResolvedValueOnce({ id: 'programme-1' });
      await service.remove('programme-1');
      expect(programmes.delete).toHaveBeenCalledWith('programme-1');
    });

    it('throws NotFoundException instead of deleting nothing when the programme is missing', async () => {
      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(programmes.delete).not.toHaveBeenCalled();
    });
  });
});
