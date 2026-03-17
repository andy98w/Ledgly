import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { PlaidService } from './plaid.service';

@Controller('organizations/:orgId/plaid')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class PlaidController {
  constructor(private readonly plaidService: PlaidService) {}

  @Get('status')
  async getStatus() {
    return { configured: this.plaidService.isConfigured() };
  }

  @Post('link-token')
  @Roles('ADMIN', 'TREASURER')
  async createLinkToken(@Param('orgId') orgId: string, @Req() req: any) {
    const token = await this.plaidService.createLinkToken(orgId, req.membership?.id || req.user?.sub || orgId);
    return { linkToken: token };
  }

  @Post('exchange')
  @Roles('ADMIN', 'TREASURER')
  async exchangeToken(
    @Param('orgId') orgId: string,
    @Body() body: { publicToken: string },
  ) {
    return this.plaidService.exchangePublicToken(orgId, body.publicToken);
  }

  @Get('connections')
  async getConnections(@Param('orgId') orgId: string) {
    const connections = await this.plaidService.getConnections(orgId);
    return { connections };
  }

  @Post('sync')
  @Roles('ADMIN', 'TREASURER')
  async sync(@Param('orgId') orgId: string) {
    return this.plaidService.syncTransactions(orgId);
  }

  @Post('connections/:connectionId/update-link-token')
  @Roles('ADMIN', 'TREASURER')
  async createUpdateLinkToken(@Param('connectionId') connectionId: string, @Req() req: any) {
    const token = await this.plaidService.createUpdateLinkToken(connectionId, req.membership?.id || req.user?.sub || connectionId);
    return { linkToken: token };
  }

  @Delete('connections/:connectionId')
  @Roles('ADMIN', 'TREASURER')
  async disconnect(@Param('connectionId') connectionId: string) {
    await this.plaidService.disconnect(connectionId);
    return { success: true };
  }
}
