import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsOptional, IsArray, IsBoolean, IsObject, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { OrganizationsService } from './organizations.service';
import { CurrentUser, CurrentUserData, Roles, Public } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

class CreateOrganizationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  name: string;

  @IsString()
  @IsOptional()
  timezone?: string;
}

class UpdateOrganizationDto {
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(100)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  name?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  enabledPaymentSources?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(500)
  paymentInstructions?: string;

  @IsObject()
  @IsOptional()
  paymentHandles?: Record<string, string>;

  @IsString()
  @IsOptional()
  gmailSyncAfter?: string;

  @IsObject()
  @IsOptional()
  notificationTemplates?: Record<string, string>;
}

class UpdateJoinCodeSettingsDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsBoolean()
  @IsOptional()
  requiresApproval?: boolean;
}

class JoinWithCodeDto {
  @IsString()
  code: string;
}

@Controller('organizations')
@UseGuards(AuthGuard('jwt'))
export class OrganizationsController {
  constructor(private organizationsService: OrganizationsService) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserData) {
    return this.organizationsService.getUserOrganizations(user.userId);
  }

  @Post()
  async create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(user.userId, dto);
  }

  // Public: resolve join code → org name (for /join page before auth)
  @Public()
  @Get('resolve-code/:code')
  async resolveJoinCode(@Param('code') code: string) {
    return this.organizationsService.resolveJoinCode(code);
  }

  // Authenticated (no role needed): join an org with a code
  @Post('join')
  async joinWithCode(@Body() dto: JoinWithCodeDto, @CurrentUser() user: CurrentUserData) {
    return this.organizationsService.joinWithCode(dto.code, user.userId);
  }

  @Get(':orgId')
  async findOne(@Param('orgId') orgId: string, @CurrentUser() user: CurrentUserData) {
    return this.organizationsService.findOne(orgId, user.userId);
  }

  @Patch(':orgId')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async update(@Param('orgId') orgId: string, @Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.update(orgId, dto);
  }

  @Get(':orgId/dashboard')
  async getDashboard(@Param('orgId') orgId: string, @CurrentUser() user: CurrentUserData) {
    await this.organizationsService.findOne(orgId, user.userId);
    return this.organizationsService.getDashboard(orgId);
  }

  @Post(':orgId/join-code')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async generateJoinCode(@Param('orgId') orgId: string, @Req() req: any) {
    return this.organizationsService.generateJoinCode(orgId, req.membership.id);
  }

  @Delete(':orgId/join-code')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async disableJoinCode(@Param('orgId') orgId: string, @Req() req: any) {
    return this.organizationsService.disableJoinCode(orgId, req.membership.id);
  }

  @Patch(':orgId/join-code')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async updateJoinCodeSettings(@Param('orgId') orgId: string, @Body() dto: UpdateJoinCodeSettingsDto, @Req() req: any) {
    return this.organizationsService.updateJoinCodeSettings(orgId, dto, req.membership.id);
  }

  @Get(':orgId/insights')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TREASURER')
  async getInsights(@Param('orgId') orgId: string) {
    return this.organizationsService.getInsights(orgId);
  }

  @Delete(':orgId')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  async delete(@Param('orgId') orgId: string) {
    return this.organizationsService.delete(orgId);
  }
}
