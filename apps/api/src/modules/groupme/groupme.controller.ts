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
import { GroupMeService } from './groupme.service';

@Controller('organizations/:orgId/groupme')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class GroupMeController {
  constructor(private readonly groupmeService: GroupMeService) {}

  @Get('connections')
  async getConnections(@Param('orgId') orgId: string) {
    const connections = await this.groupmeService.getConnections(orgId);
    return { connections };
  }

  @Post('connect')
  @Roles('ADMIN', 'TREASURER')
  async connect(@Param('orgId') orgId: string, @Body() body: { botId: string; groupName?: string }) {
    return this.groupmeService.connect(orgId, body.botId, body.groupName);
  }

  @Delete('connections/:connectionId')
  @Roles('ADMIN', 'TREASURER')
  async disconnect(@Param('connectionId') connectionId: string) {
    await this.groupmeService.disconnect(connectionId);
    return { success: true };
  }

  @Post('test')
  @Roles('ADMIN', 'TREASURER')
  async testMessage(@Param('orgId') orgId: string) {
    await this.groupmeService.postMessage(orgId, '\uD83C\uDF89 Ledgly is connected! Financial updates will appear here.');
    return { success: true };
  }
}
