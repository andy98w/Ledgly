import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsBoolean, IsOptional, MinLength, MaxLength } from 'class-validator';
import { AnnouncementsService } from './announcements.service';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

class CreateAnnouncementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  body?: string;

  @IsBoolean()
  @IsOptional()
  broadcast?: boolean;
}

@Controller('organizations/:orgId/announcements')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AnnouncementsController {
  constructor(private announcementsService: AnnouncementsService) {}

  @Get()
  async findAll(@Param('orgId') orgId: string) {
    return this.announcementsService.findAll(orgId);
  }

  @Post()
  @Roles('ADMIN', 'TREASURER')
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateAnnouncementDto,
    @Req() req: any,
  ) {
    const actorId = req.membership.id;
    return this.announcementsService.create(
      orgId,
      actorId,
      dto.title,
      dto.body || dto.title,
      dto.broadcast ?? false,
    );
  }

  @Post(':id/broadcast')
  @Roles('ADMIN', 'TREASURER')
  async broadcast(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.announcementsService.broadcast(orgId, id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'TREASURER')
  async delete(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.announcementsService.delete(orgId, id);
  }
}
