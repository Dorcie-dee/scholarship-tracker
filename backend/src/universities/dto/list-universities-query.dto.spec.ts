import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ListUniversitiesQueryDto } from './list-universities-query.dto';
import { SHORT_TEXT_MAX_LENGTH } from '../../common/validators/text-limits';

/** Final verification pass — `search` had no `@MaxLength` (a real gap found during this audit). */
describe('ListUniversitiesQueryDto — search size limit', () => {
  it('accepts a normal search term', async () => {
    const dto = plainToInstance(ListUniversitiesQueryDto, { search: 'Oxford' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an oversized search term', async () => {
    const dto = plainToInstance(ListUniversitiesQueryDto, {
      search: 'x'.repeat(SHORT_TEXT_MAX_LENGTH + 1),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'search')).toBe(true);
  });
});
