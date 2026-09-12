import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { ApplicationJourney } from '../journeys/entities/application-journey.entity';
import { Document } from '../documents/entities/document.entity';
import { CloudinaryModule } from '../common/cloudinary/cloudinary.module';
import { UsersService } from './users.service';
import { AccountErasureService } from './account-erasure.service';
import { UsersController } from './users.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, ApplicationJourney, Document]),
    // Registered directly (repositories, not JourneysModule/DocumentsModule)
    // — see account-erasure.service.ts's doc comment for why.
    CloudinaryModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, AccountErasureService],
  exports: [UsersService],
})
export class UsersModule {}
