import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateProfileDto } from './update-profile.dto';

/**
 * Production hardening (Batch 8) — proves UpdateProfileDto's new size
 * bounds actually reject oversized input, not just that the decorators are
 * present. Real `class-validator` `validate()` calls, no mocking.
 */
describe('UpdateProfileDto — size limits (Batch 8)', () => {
  it('accepts a normal, well within limits profile update', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      nationality: 'Kenyan',
      summary: 'A short personal statement.',
      education: [{ degree: 'BSc' }],
      skills: Array.from({ length: 20 }, (_, i) => ({ name: `skill-${i}` })),
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an education array over the 50-item cap', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      education: Array.from({ length: 51 }, () => ({ degree: 'BSc' })),
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'education')).toBe(true);
  });

  it('accepts exactly the 50-item cap on education', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      education: Array.from({ length: 50 }, () => ({ degree: 'BSc' })),
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a skills array over the 100-item cap', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      skills: Array.from({ length: 101 }, (_, i) => ({ name: `skill-${i}` })),
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'skills')).toBe(true);
  });

  it('rejects a summary longer than the shared free-text limit', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      summary: 'x'.repeat(10_001),
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'summary')).toBe(true);
  });

  it('rejects an oversized nationality string', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      nationality: 'x'.repeat(256),
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'nationality')).toBe(true);
  });

  it('still allows an unbounded-shape metadata object (deliberately, see doc comment)', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      metadata: { anything: 'goes', nested: { a: 1, b: [1, 2, 3] } },
    });

    expect(await validate(dto)).toHaveLength(0);
  });
});
