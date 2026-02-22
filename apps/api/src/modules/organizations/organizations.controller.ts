import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsBoolean, IsOptional } from 'class-validator';
import { OrganizationsService } from './organizations.service';
import { CurrentUser, CurrentUserData, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

class CreateOrganizationDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  timezone?: string;
}

class UpdateOrganizationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsBoolean()
  @IsOptional()
  autoApprovePayments?: boolean;

  @IsBoolean()
  @IsOptional()
  autoApproveExpenses?: boolean;
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
    // Verify membership
    await this.organizationsService.findOne(orgId, user.userId);
    return this.organizationsService.getDashboard(orgId);
  }

  @Delete(':orgId')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async delete(@Param('orgId') orgId: string) {
    return this.organizationsService.delete(orgId);
  }
}
