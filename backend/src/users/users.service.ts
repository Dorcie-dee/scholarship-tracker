import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { UserRole } from '../types';
import { AppConfig } from '../config/configuration';
import {
  applyKeysetPagination,
  buildPaginatedResult,
  decodeCursor,
  PaginatedResult,
  resolvePageSize,
} from '../common/pagination/cursor';
import { likeContainsPattern } from '../common/utils/like-escape';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import {
  AdminUserDirectoryItemDto,
  toAdminUserDirectoryItem,
} from './dto/admin-user-directory-item.dto';

const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * The single normalization rule for email lookups/storage across this app:
 * trim + lowercase. Applied here (inside findByEmail) rather than only at the
 * DTO boundary, so EVERY caller gets consistent behavior.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

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

  /**
   * Current role from the database — used by RolesGuard for @Roles() checks
   * so a demoted admin cannot keep using a stale JWT claim.
   */
  async getRoleById(userId: string): Promise<UserRole | null> {
    const row = await this.usersRepository.findOne({
      where: { id: userId },
      select: { id: true, role: true },
    });
    return row?.role ?? null;
  }

  /**
   * ADMIN-only directory: keyset-paginated, searchable, never returns secrets.
   * Ordered by (createdAt, id) DESC — newest accounts first.
   */
  async findAllForAdmin(
    query: ListUsersQueryDto,
  ): Promise<PaginatedResult<AdminUserDirectoryItemDto>> {
    const { defaultPageSize, maxPageSize } = this.configService.get(
      'pagination',
      { infer: true },
    );
    const limit = resolvePageSize(query.limit, {
      defaultPageSize,
      maxPageSize,
    });
    const direction = query.order === 'asc' ? 'ASC' : 'DESC';

    const qb = this.usersRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.email',
        'user.name',
        'user.role',
        'user.isVerified',
        'user.createdAt',
      ]);

    if (query.role) {
      qb.andWhere('user.role = :role', { role: query.role });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        "(user.email ILIKE :search ESCAPE '\\' OR user.name ILIKE :search ESCAPE '\\')",
        { search: likeContainsPattern(search) },
      );
    }

    applyKeysetPagination(
      qb,
      'user.createdAt',
      'user.id',
      direction,
      query.cursor ? decodeCursor(query.cursor) : undefined,
      limit,
    );

    const rows = await qb.getMany();
    const page = buildPaginatedResult(
      rows,
      limit,
      (r) => r.createdAt.toISOString(),
      (r) => r.id,
    );
    return {
      items: page.items.map(toAdminUserDirectoryItem),
      nextCursor: page.nextCursor,
      hasNextPage: page.hasNextPage,
    };
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
      role: UserRole.USER,
    });
    try {
      return await this.usersRepository.save(user);
    } catch (error) {
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
   * Explicit field allowlist — never passes `role` or `passwordHash`.
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

  /**
   * ADMIN-only role change for another user. Self-change forbidden;
   * demoting the last remaining ADMIN forbidden. Atomic under a transaction.
   */
  async updateRole(
    actorUserId: string,
    targetUserId: string,
    dto: UpdateUserRoleDto,
  ): Promise<User> {
    if (actorUserId === targetUserId) {
      throw new ForbiddenException('You cannot change your own role');
    }

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(User);
      const target = await repo.findOne({
        where: { id: targetUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!target) {
        throw new NotFoundException('User not found');
      }

      const previousRole = target.role;
      if (previousRole === dto.role) {
        return target;
      }

      if (previousRole === UserRole.ADMIN && dto.role === UserRole.USER) {
        const adminCount = await repo.count({
          where: { role: UserRole.ADMIN },
        });
        if (adminCount <= 1) {
          throw new BadRequestException(
            'Cannot demote the last remaining administrator',
          );
        }
      }

      target.role = dto.role;
      const saved = await repo.save(target);

      this.logger.log(
        JSON.stringify({
          event: 'user.role_changed',
          actorUserId,
          targetUserId,
          previousRole,
          newRole: dto.role,
        }),
      );

      return saved;
    });
  }
}
