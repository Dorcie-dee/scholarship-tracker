import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationQueryDto } from './pagination-query.dto';
import { CURSOR_MAX_LENGTH } from '../validators/text-limits';

/**
 * Final verification pass — a real gap found during this audit:
 * `cursor` (shared by every one of the ten paginated list endpoints) had no
 * `@MaxLength` at all, unlike every other client-controllable string field
 * in this codebase. Fixing it once here closes the gap everywhere it's
 * used, at once — proven directly against real `class-validator`
 * `validate()` calls, not just the presence of a decorator.
 */
describe('PaginationQueryDto — cursor size limit', () => {
  it('accepts a normal, realistically-sized cursor', async () => {
    const dto = plainToInstance(PaginationQueryDto, {
      cursor: Buffer.from(
        JSON.stringify({
          sortValue: '2026-01-01T00:00:00.000Z',
          id: 'x'.repeat(36),
        }),
      ).toString('base64url'),
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a pathologically oversized cursor', async () => {
    const dto = plainToInstance(PaginationQueryDto, {
      cursor: 'x'.repeat(CURSOR_MAX_LENGTH + 1),
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'cursor')).toBe(true);
  });

  it('accepts exactly the max length', async () => {
    const dto = plainToInstance(PaginationQueryDto, {
      cursor: 'x'.repeat(CURSOR_MAX_LENGTH),
    });

    expect(await validate(dto)).toHaveLength(0);
  });
});
