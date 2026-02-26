import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsEmail, IsOptional, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { MembersService } from './members.service';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

class CreateMemberDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  name: string;

  @IsEnum(MembershipRole)
  @IsOptional()
  role?: MembershipRole;
}

class CreateMembersBulkDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMemberDto)
  members: CreateMemberDto[];
}

class UpdateMemberDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(MembershipRole)
  @IsOptional()
  role?: MembershipRole;

  @IsEnum(MembershipStatus)
  @IsOptional()
  status?: MembershipStatus;
}

class MemberFiltersDto {
  @IsOptional()
  status?: MembershipStatus;

  @IsOptional()
  hasBalance?: string;

  @IsOptional()
  search?: string;

  @IsOptional()
  page?: string;

  @IsOptional()
  limit?: string;
}

@Controller('organizations/:orgId/members')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class MembersController {
  constructor(private membersService: MembersService) {}

  @Get()
  async findAll(@Param('orgId') orgId: string, @Query() query: MemberFiltersDto) {
    return this.membersService.findAll(orgId, {
      status: query.status,
      hasBalance: query.hasBalance ? query.hasBalance === 'true' : undefined,
      search: query.search,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
    });
  }

  @Post('bulk-delete')
  @Roles('ADMIN')
  async bulkDelete(@Param('orgId') orgId: string, @Body() body: { memberIds: string[] }, @Req() req: any) {
    const actorId = req.membership.id;
    return this.membersService.bulkRemove(orgId, body.memberIds, actorId);
  }

  @Get(':id')
  async findOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.membersService.findOne(orgId, id);
  }

  @Post()
  @Roles('ADMIN', 'TREASURER')
  async create(@Param('orgId') orgId: string, @Body() dto: CreateMembersBulkDto, @Req() req: any) {
    const actorId = req.membership?.id;
    const actorName = req.membership?.name;
    return this.membersService.createMany(orgId, dto.members, actorId, actorName);
  }

  @Post(':id/resend-invitation')
  @Roles('ADMIN')
  async resendInvitation(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: any) {
    const actorName = req.membership?.name;
    return this.membersService.resendInvitation(orgId, id, actorName);
  }

  @Patch(':id')
  @Roles('ADMIN', 'TREASURER')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
    @Req() req: any,
  ) {
    const actorId = req.membership?.id;
    return this.membersService.update(orgId, id, dto, actorId);
  }

  @Delete(':id')
  @Roles('ADMIN')
  async remove(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: any) {
    const actorId = req.membership?.id;
    return this.membersService.remove(orgId, id, actorId);
  }

  @Post(':id/restore')
  @Roles('ADMIN')
  async restore(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: any) {
    const actorId = req.membership?.id;
    return this.membersService.restore(orgId, id, actorId);
  }
}
