import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApplicantProfile } from './entities/applicant-profile.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(ApplicantProfile)
    private readonly profiles: Repository<ApplicantProfile>,
  ) {}

  /** Called once at registration (see auth.service.ts) so every user has exactly one profile row. */
  async createEmptyProfile(userId: string): Promise<ApplicantProfile> {
    const profile = this.profiles.create({
      userId,
      nationality: null,
      dateOfBirth: null,
      summary: null,
      education: [],
      experience: [],
      skills: [],
      certifications: [],
      languages: [],
      metadata: {},
    });
    return this.profiles.save(profile);
  }

  async getByUserId(userId: string): Promise<ApplicantProfile> {
    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  async update(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ApplicantProfile> {
    const profile = await this.getByUserId(userId);
    Object.assign(profile, dto);
    return this.profiles.save(profile);
  }
}
