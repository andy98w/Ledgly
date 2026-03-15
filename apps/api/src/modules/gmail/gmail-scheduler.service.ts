import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { GmailService } from './gmail.service';

@Injectable()
export class GmailSchedulerService {
  private readonly logger = new Logger(GmailSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private gmailService: GmailService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async syncAllOrganizations() {
    this.logger.log('Starting scheduled Gmail sync for all organizations...');

    try {
      const gmailConnections = await this.prisma.gmailConnection.findMany({
        where: {
          isActive: true,
          refreshToken: { not: '' },
        },
        select: {
          orgId: true,
          org: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      const orgMap = new Map<string, { id: string; name: string }>();
      for (const c of gmailConnections) {
        orgMap.set(c.orgId, c.org);
      }
      const orgsWithGmail = Array.from(orgMap.values());

      if (orgsWithGmail.length === 0) {
        this.logger.log('No organizations with Gmail connected');
        return;
      }

      this.logger.log(`Found ${orgsWithGmail.length} organizations with Gmail connected`);

      for (const org of orgsWithGmail) {
        try {
          this.logger.log(`Syncing Gmail for org: ${org.name} (${org.id})`);
          const result = await this.gmailService.syncEmails(org.id);
          this.logger.log(
            `Synced org ${org.name}: ${result.imported} imported, ${result.skipped} skipped`,
          );
        } catch (error: any) {
          this.logger.error(`Failed to sync org ${org.name}: ${error.message}`);
        }
      }

      this.logger.log('Scheduled Gmail sync completed');
    } catch (error: any) {
      this.logger.error(`Scheduled sync failed: ${error.message}`);
    }
  }
}
