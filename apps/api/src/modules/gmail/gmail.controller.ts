import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Res,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { IsString, IsOptional } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { GmailService } from './gmail.service';

class ConfirmImportDto {
  @IsString()
  @IsOptional()
  membershipId?: string;
}

class ConfirmExpenseImportDto {
  @IsString()
  @IsOptional()
  linkToExpenseId?: string;

  @IsOptional()
  createNew?: boolean;
}

// OAuth flow routes — connect requires auth, callback must be public (Google redirect)
@Controller('gmail')
export class GmailPublicController {
  constructor(
    private readonly gmailService: GmailService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // Initiates OAuth flow — requires JWT auth + org membership
  @Get('connect/:orgId')
  @UseGuards(AuthGuard('jwt'))
  async connect(
    @Param('orgId') orgId: string,
    @Query('returnTo') returnTo: string | undefined,
    @Req() req: any,
    @Res() res: Response,
  ) {
    // Verify user is an active admin/owner of this org
    const membership = await this.prisma.membership.findFirst({
      where: { orgId, userId: req.user.id, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('Only org admins can connect Gmail');
    }

    const authUrl = this.gmailService.getAuthUrl({ orgId, returnTo: returnTo || null });
    res.redirect(authUrl);
  }

  // OAuth callback from Google (must be public — Google redirects here)
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') stateParam: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('WEB_URL');

    try {
      const { orgId, returnTo } = this.gmailService.parseAndVerifyState(stateParam);

      await this.gmailService.handleCallback(code, orgId);

      if (returnTo) {
        const separator = returnTo.includes('?') ? '&' : '?';
        res.redirect(`${frontendUrl}${returnTo}${separator}connected=true`);
      } else {
        res.redirect(`${frontendUrl}/inbox?connected=true`);
      }
    } catch (error) {
      const message = error?.message || 'connection_failed';
      res.redirect(`${frontendUrl}/inbox?error=${encodeURIComponent(message)}`);
    }
  }
}

@Controller('organizations/:orgId/gmail')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class GmailController {
  constructor(private readonly gmailService: GmailService) {}

  @Get('status')
  async getStatus(@Param('orgId') orgId: string) {
    const connection = await this.gmailService.getConnection(orgId);
    if (!connection) {
      return { connected: false };
    }
    return {
      connected: true,
      email: connection.email,
      lastSyncAt: connection.lastSyncAt,
      isActive: connection.isActive,
    };
  }

  @Delete('disconnect')
  @Roles('ADMIN', 'TREASURER')
  async disconnect(@Param('orgId') orgId: string, @Req() req: any) {
    await this.gmailService.disconnect(orgId, req.membership?.id);
    return { success: true };
  }

  @Post('sync')
  async sync(@Param('orgId') orgId: string) {
    const result = await this.gmailService.syncEmails(orgId);
    return result;
  }

  @Get('imports')
  async getImports(
    @Param('orgId') orgId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;

    if (status === 'auto_confirmed') {
      const imports = await this.gmailService.getRecentAutoConfirmed(orgId, limitNum);
      return { data: imports };
    }

    if (status === 'confirmed') {
      const imports = await this.gmailService.getRecentConfirmed(orgId, limitNum);
      return { data: imports };
    }

    if (status === 'ignored') {
      const imports = await this.gmailService.getIgnoredImports(orgId, limitNum);
      return { data: imports };
    }

    if (status === 'pending' || !status) {
      const imports = await this.gmailService.getPendingImports(orgId, limitNum);
      return { data: imports };
    }

    return { data: [] };
  }

  @Get('imports/stats')
  async getImportStats(@Param('orgId') orgId: string) {
    return this.gmailService.getImportStats(orgId);
  }

  @Post('imports/:importId/confirm')
  @Roles('ADMIN', 'TREASURER')
  async confirmImport(
    @Param('orgId') orgId: string,
    @Param('importId') importId: string,
    @Body() dto: ConfirmImportDto,
    @Req() req: any,
  ) {
    const membershipId = req.membership.id;
    const payment = await this.gmailService.confirmImport(
      importId,
      dto.membershipId || null,
      membershipId,
    );
    return payment;
  }

  @Post('imports/:importId/ignore')
  @Roles('ADMIN', 'TREASURER')
  async ignoreImport(@Param('importId') importId: string) {
    await this.gmailService.ignoreImport(importId);
    return { success: true };
  }

  @Post('imports/:importId/restore')
  @Roles('ADMIN', 'TREASURER')
  async restoreImport(@Param('importId') importId: string) {
    await this.gmailService.restoreImport(importId);
    return { success: true };
  }

  @Post('imports/:importId/unconfirm')
  @Roles('ADMIN', 'TREASURER')
  async unconfirmImport(@Param('importId') importId: string) {
    await this.gmailService.unconfirmImport(importId);
    return { success: true };
  }

  @Get('imports/:importId/expense-matches')
  async getExpenseMatches(@Param('importId') importId: string) {
    const matches = await this.gmailService.getPotentialExpenseMatches(importId);
    return { data: matches };
  }

  @Post('imports/:importId/confirm-expense')
  @Roles('ADMIN', 'TREASURER')
  async confirmExpenseImport(
    @Param('importId') importId: string,
    @Body() dto: ConfirmExpenseImportDto,
    @Req() req: any,
  ) {
    const actorId = req.membership.id;
    const result = await this.gmailService.confirmExpenseImport(
      importId,
      actorId,
      {
        linkToExpenseId: dto.linkToExpenseId,
        createNew: dto.createNew,
      },
    );
    return result;
  }
}
