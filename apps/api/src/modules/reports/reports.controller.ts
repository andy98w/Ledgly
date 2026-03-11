import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReportsService } from './reports.service';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

@Controller('organizations/:orgId/reports')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN', 'TREASURER')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('collection')
  async getCollection(
    @Param('orgId') orgId: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.reportsService.getCollectionReport(orgId, start, end);
  }

  @Get('outstanding')
  async getOutstanding(@Param('orgId') orgId: string) {
    return this.reportsService.getOutstandingReport(orgId);
  }

  @Get('comparison')
  async getComparison(
    @Param('orgId') orgId: string,
    @Query('currentStart') currentStart: string,
    @Query('currentEnd') currentEnd: string,
    @Query('prevStart') prevStart: string,
    @Query('prevEnd') prevEnd: string,
  ) {
    return this.reportsService.getPeriodComparison(orgId, currentStart, currentEnd, prevStart, prevEnd);
  }
}
