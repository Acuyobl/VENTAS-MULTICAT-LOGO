import { Module } from '@nestjs/common';
import { GatewaysController } from './gateways.controller';
import { GatewaysRepository } from './gateways.repository';
import { GatewaysService } from './gateways.service';
import { OrgSettingsController } from './org-settings.controller';
import { OrgSettingsService } from './org-settings.service';
import { PublicAppSettingsController } from './public-app-settings.controller';

@Module({
  controllers: [OrgSettingsController, PublicAppSettingsController, GatewaysController],
  providers: [OrgSettingsService, GatewaysRepository, GatewaysService],
})
export class OrganizationsModule {}
