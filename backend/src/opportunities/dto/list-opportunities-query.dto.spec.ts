import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ListOpportunitiesQueryDto } from './list-opportunities-query.dto';
import { SHORT_TEXT_MAX_LENGTH } from '../../common/validators/text-limits';

/** Final verification pass — `country` had no `@MaxLength` (a real gap found during this audit). */
describe('ListOpportunitiesQueryDto — country size limit', () => {
  it('accepts a normal country filter', async () => {
    const dto = plainToInstance(ListOpportunitiesQueryDto, {
      country: 'Netherlands',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an oversized country filter', async () => {
    const dto = plainToInstance(ListOpportunitiesQueryDto, {
      country: 'x'.repeat(SHORT_TEXT_MAX_LENGTH + 1),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'country')).toBe(true);
  });
});
