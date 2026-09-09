import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './dto/register.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';

/**
 * Track 1 Group B — RBAC privilege-escalation coverage at the DTO/
 * ValidationPipe boundary, complementing the service-level tests in
 * users.service.spec.ts. Uses the exact options this app's global
 * ValidationPipe is configured with (`whitelist: true,
 * forbidNonWhitelisted: true` — see bootstrap.ts) so this proves what the
 * real HTTP pipeline does with an extraneous `role` field, not an
 * approximation of it.
 */
describe('Privilege escalation — role cannot be supplied through public DTOs', () => {
  it('RegisterDto rejects a request body that includes a role field', async () => {
    const dto = plainToInstance(RegisterDto, {
      email: 'person@example.invalid',
      password: 'a reasonably strong passphrase',
      role: 'admin',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });

  it('UpdateUserDto rejects a request body that includes a role field', async () => {
    const dto = plainToInstance(UpdateUserDto, {
      name: 'New name',
      role: 'admin',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });

  it('a well-formed RegisterDto with no role field validates cleanly', async () => {
    const dto = plainToInstance(RegisterDto, {
      email: 'person@example.invalid',
      password: 'a reasonably strong passphrase',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(0);
  });
});
