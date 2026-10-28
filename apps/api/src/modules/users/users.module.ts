import { Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { UsersService } from './users.service';
import { InvitationsService } from './invitations.service';
import {
  InvitationAcceptanceController,
  InvitationsController,
  UsersController,
} from './users.controller';

@Module({
  controllers: [UsersController, InvitationsController, InvitationAcceptanceController],
  providers: [PermissionsService, UsersService, InvitationsService],
  exports: [PermissionsService, UsersService, InvitationsService],
})
export class UsersModule {}
