import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ApplicantProfile } from './entities/applicant-profile.entity';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  getMyProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApplicantProfile> {
    return this.profileService.getByUserId(user.userId);
  }

  @Patch()
  updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ApplicantProfile> {
    return this.profileService.update(user.userId, dto);
  }
}
