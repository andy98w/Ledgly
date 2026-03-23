import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { PlaidService } from './plaid.service';

@Injectable()
export class PlaidSchedulerService {
  private readonly logger = new Logger(PlaidSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private plaidService: PlaidService,
  ) {}

  @Cron('0 */2 * * *')
  async syncAllOrganizations() {
    if (!this.plaidService.isConfigured()) return;

    this.logger.log('Starting scheduled Plaid sync for all organizations...');

    try {
      const connections = await this.prisma.plaidConnection.findMany({
        where: { isActive: true },
        select: {
          orgId: true,
          org: { select: { id: true, name: true } },
        },
      });

      const orgMap = new Map<string, { id: string; name: string }>();
      for (const c of connections) {
        orgMap.set(c.orgId, c.org);
      }
      const orgs = Array.from(orgMap.values());

      if (orgs.length === 0) {
        this.logger.log('No organizations with Plaid connected');
        return;
      }

      this.logger.log(`Found ${orgs.length} organizations with Plaid connected`);

      for (const org of orgs) {
        try {
          this.logger.log(`Syncing Plaid for org: ${org.name} (${org.id})`);
          const result = await this.plaidService.syncTransactions(org.id);
          this.logger.log(
            `Synced org ${org.name}: ${result.imported} imported, ${result.skipped} skipped`,
          );
        } catch (error: any) {
          this.logger.error(`Failed to sync org ${org.name}: ${error.message}`);
        }
      }

      this.logger.log('Scheduled Plaid sync completed');
    } catch (error: any) {
      this.logger.error(`Scheduled Plaid sync failed: ${error.message}`);
    }
  }
}
