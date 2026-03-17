import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { NotificationChannelsService } from './notification-channels.service';

@Controller('organizations/:orgId/slack')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SlackController {
  constructor(private readonly channels: NotificationChannelsService) {}

  @Get('connections')
  async getConnections(@Param('orgId') orgId: string) {
    const connections = await this.channels.getSlackConnections(orgId);
    return { connections };
  }

  @Post('connect')
  @Roles('ADMIN', 'TREASURER')
  async connect(@Param('orgId') orgId: string, @Body() body: { webhookUrl: string; channelName?: string }) {
    return this.channels.connectSlack(orgId, body.webhookUrl, body.channelName);
  }

  @Delete('connections/:connectionId')
  @Roles('ADMIN', 'TREASURER')
  async disconnect(@Param('connectionId') connectionId: string) {
    await this.channels.disconnectSlack(connectionId);
    return { success: true };
  }

  @Post('test')
  @Roles('ADMIN', 'TREASURER')
  async testMessage(@Param('orgId') orgId: string) {
    await this.channels.testSlack(orgId);
    return { success: true };
  }
}
