import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { UserRole } from '../types';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';

const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * The single normalization rule for email lookups/storage across this app:
 * trim + lowercase. Applied here (inside findByEmail) rather than only at the
 * DTO boundary, so EVERY caller — login, registration's duplicate check,
 * password reset, a future admin tool, a seed script — gets consistent
 * behavior regardless of what casing was typed in. Before this fix,
 * findByEmail queried with the caller's raw casing while createUser() stored
 * a lowercased value, so a user who registered as "Jane@Example.com" could
 * not log in typing that same casing back — see docs/decisions.md, "Email
 * normalization".
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /**
   * `withPasswordHash` opts in to selecting the (by default excluded-from-
   * serialization, but not excluded-from-query) passwordHash column — needed
   * only by AuthService when verifying credentials.
   */
  findByEmail(email: string, withPasswordHash = false): Promise<User | null> {
    const normalized = normalizeEmail(email);
    if (!withPasswordHash) {
      return this.usersRepository.findOne({ where: { email: normalized } });
    }
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: normalized })
      .getOne();
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async getByIdOrThrow(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async createUser(params: {
    email: string;
    passwordHash: string;
    name?: string | null;
  }): Promise<User> {
    const existing = await this.findByEmail(params.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    const user = this.usersRepository.create({
      email: normalizeEmail(params.email),
      passwordHash: params.passwordHash,
      name: params.name ?? null,
      isVerified: false,
      // Explicit, not relied-on-via-DB-default: `params` has no `role` field
      // at all (TypeScript itself refuses to compile a caller trying to pass
      // one), and this line is the one place that decides a new account's
      // role — every account created through this service starts as the
      // least-privileged role. See docs/decisions.md, "Privilege escalation
      // — every path checked".
      role: UserRole.USER,
    });
    try {
      return await this.usersRepository.save(user);
    } catch (error) {
      // Closes the race window between the check above and this insert: if
      // two requests for the same email land close enough together, both can
      // pass the check before either commits. The email column's unique index
      // then rejects the second insert — translate that specific failure into
      // the same ConflictException the check above gives, instead of letting
      // a raw QueryFailedError surface as an unhandled 500. Any other kind of
      // database failure still propagates unchanged.
      if (
        error instanceof QueryFailedError &&
        (error as unknown as { code?: string }).code ===
          POSTGRES_UNIQUE_VIOLATION
      ) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }

  /**
   * Moved here from UsersController (Track 1, A1.3) — the controller
   * previously called `Repository<User>.update()` directly, the only place
   * in this codebase a controller talked to the database itself. Same query
   * shape as before (one UPDATE, then one SELECT via getByIdOrThrow) —
   * deliberately not switched to a read-modify-write pattern, since that
   * would be a behavior change this checkpoint doesn't call for.
   *
   * Explicit field allowlist (Track 1, Group B RBAC hardening) — deliberately
   * NOT `this.usersRepository.update(userId, dto)` passing the whole DTO
   * through. `UpdateUserDto` doesn't declare `role` today, and the global
   * ValidationPipe (`whitelist: true, forbidNonWhitelisted: true`) already
   * rejects an unknown field at the HTTP boundary either way — but this
   * method is a second, independent line of defense against privilege
   * escalation: even if a future change ever added a field to
   * `UpdateUserDto` without thinking through its implications, or a
   * different, less-careful caller invoked this service directly with a
   * hand-built object, `role` (and passwordHash — never intended to be
   * settable through this path either) still could not be written through
   * here, because nothing but the fields explicitly picked below is ever
   * passed to the repository.
   */
  async update(userId: string, dto: UpdateUserDto): Promise<User> {
    const allowedUpdate: Pick<UpdateUserDto, 'name'> = {};
    if (dto.name !== undefined) {
      allowedUpdate.name = dto.name;
    }
    await this.usersRepository.update(userId, allowedUpdate);
    return this.getByIdOrThrow(userId);
  }

  async markVerified(userId: string): Promise<void> {
    await this.usersRepository.update(userId, { isVerified: true });
  }
}
