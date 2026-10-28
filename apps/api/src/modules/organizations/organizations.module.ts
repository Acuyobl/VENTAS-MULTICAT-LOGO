import { Module } from '@nestjs/common';
import { GatewaysController } from './gateways.controller';
import { GatewaysRepository } from './gateways.repository';
import { GatewaysService } from './gateways.service';
import { OrgSettingsController } from './org-settings.controller';
import { OrgSettingsService } from './org-settings.service';

@Module({
  controllers: [OrgSettingsController, GatewaysController],
  providers: [OrgSettingsService, GatewaysRepository, GatewaysService],
})
export class OrganizationsModule {}
