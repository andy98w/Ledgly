import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';
import { RolesGuard } from '../../common/guards';

@Controller('organizations/:orgId/notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  async findAll(
    @Param('orgId') orgId: string,
    @Query('read') read?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.notificationsService.findAll(orgId, {
      read: read !== undefined ? read === 'true' : undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('unread-count')
  async getUnreadCount(@Param('orgId') orgId: string) {
    return this.notificationsService.getUnreadCount(orgId);
  }

  @Patch(':id/read')
  async markAsRead(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markAsRead(orgId, id);
  }

  @Patch('read-all')
  async markAllAsRead(@Param('orgId') orgId: string) {
    return this.notificationsService.markAllAsRead(orgId);
  }
}
