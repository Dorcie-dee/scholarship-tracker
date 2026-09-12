import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types';
import { UsersService } from './users.service';
import { AccountErasureService } from './account-erasure.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { User } from './entities/user.entity';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly accountErasureService: AccountErasureService,
  ) {}

  /**
   * ADMIN-only user directory — keyset-paginated, searchable.
   * Declared before `:id` routes so Nest never treats "me" as an id if a
   * GET-by-id is added later; `GET me` remains a separate static route.
   */
  @Get()
  @Roles(UserRole.ADMIN)
  findAll(@Query() query: ListUsersQueryDto) {
    return this.usersService.findAllForAdmin(query);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<User> {
    return this.usersService.getByIdOrThrow(user.userId);
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    return this.usersService.update(user.userId, dto);
  }

  /**
   * ADMIN-only role promotion/demotion for another user.
   * Never accepts role on PATCH /users/me.
   */
  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  async updateRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ): Promise<User> {
    return this.usersService.updateRole(actor.userId, id, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eraseMe(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.accountErasureService.eraseAccount(user.userId);
  }
}
