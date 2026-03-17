import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlaidService {
  private readonly logger = new Logger(PlaidService.name);
  private client: PlaidApi | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const clientId = this.configService.get<string>('PLAID_CLIENT_ID');
    const secret = this.configService.get<string>('PLAID_SECRET');
    const env = this.configService.get<string>('PLAID_ENV', 'sandbox');

    if (clientId && secret) {
      const config = new Configuration({
        basePath: PlaidEnvironments[env] || PlaidEnvironments.sandbox,
        baseOptions: {
          headers: {
            'PLAID-CLIENT-ID': clientId,
            'PLAID-SECRET': secret,
          },
        },
      });
      this.client = new PlaidApi(config);
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async createLinkToken(orgId: string, userId: string): Promise<string> {
    if (!this.client) throw new BadRequestException('Plaid not configured — check PLAID_CLIENT_ID and PLAID_SECRET environment variables');
    try {
      const response = await this.client.linkTokenCreate({
        user: { client_user_id: userId },
        client_name: 'Ledgly',
        products: [Products.Transactions],
        country_codes: [CountryCode.Us],
        language: 'en',
      });
      return response.data.link_token;
    } catch (err: any) {
      const plaidError = err?.response?.data;
      const msg = plaidError?.error_message || err.message || 'Failed to initialize bank connection';
      this.logger.error(`Plaid linkTokenCreate failed: ${msg}`, plaidError);
      throw new BadRequestException(msg);
    }
  }

  async createUpdateLinkToken(connectionId: string, userId: string): Promise<string> {
    if (!this.client) throw new Error('Plaid not configured');
    const conn = await this.prisma.plaidConnection.findUnique({ where: { id: connectionId } });
    if (!conn) throw new NotFoundException('Connection not found');

    const response = await this.client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'Ledgly',
      access_token: conn.accessToken,
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    return response.data.link_token;
  }

  async exchangePublicToken(orgId: string, publicToken: string): Promise<{ connectionId: string }> {
    if (!this.client) throw new Error('Plaid not configured');
    const exchange = await this.client.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    const existing = await this.prisma.plaidConnection.findFirst({
      where: { orgId, itemId },
    });
    if (existing) {
      await this.client.itemRemove({ access_token: accessToken });
      throw new ConflictException('This bank account is already connected');
    }

    const accounts = await this.client.accountsGet({ access_token: accessToken });
    const account = accounts.data.accounts[0];

    if (account?.mask && accounts.data.item.institution_id) {
      const duplicateAccount = await this.prisma.plaidConnection.findFirst({
        where: {
          orgId,
          accountMask: account.mask,
          institutionName: { not: null },
        },
      });
      if (duplicateAccount) {
        await this.client.itemRemove({ access_token: accessToken });
        throw new ConflictException('This bank account is already connected');
      }
    }

    const connection = await this.prisma.plaidConnection.create({
      data: {
        orgId,
        accessToken,
        itemId,
        institutionName: accounts.data.item.institution_id || null,
        accountMask: account?.mask || null,
        accountName: account?.name || null,
      },
    });

    try {
      if (accounts.data.item.institution_id) {
        const inst = await this.client.institutionsGetById({
          institution_id: accounts.data.item.institution_id,
          country_codes: [CountryCode.Us],
        });
        await this.prisma.plaidConnection.update({
          where: { id: connection.id },
          data: { institutionName: inst.data.institution.name },
        });
      }
    } catch {}

    return { connectionId: connection.id };
  }

  async syncTransactions(orgId: string): Promise<{ imported: number; skipped: number }> {
    if (!this.client) throw new Error('Plaid not configured');

    const connections = await this.prisma.plaidConnection.findMany({
      where: { orgId, isActive: true },
    });

    let totalImported = 0;
    let totalSkipped = 0;

    for (const conn of connections) {
      try {
        const result = await this.syncConnection(conn);
        totalImported += result.imported;
        totalSkipped += result.skipped;
      } catch (err) {
        this.logger.error(`Failed to sync Plaid connection ${conn.id}: ${err.message}`);
      }
    }

    return { imported: totalImported, skipped: totalSkipped };
  }

  private async syncConnection(conn: any): Promise<{ imported: number; skipped: number }> {
    let cursor = conn.cursor || undefined;
    let imported = 0;
    let skipped = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await this.client!.transactionsSync({
        access_token: conn.accessToken,
        cursor,
      });

      const { added, next_cursor, has_more } = response.data;
      hasMore = has_more;
      cursor = next_cursor;

      for (const txn of added) {
        const name = (txn.name || '').toLowerCase();
        const merchantName = (txn.merchant_name || '').toLowerCase();
        const isP2P =
          name.includes('zelle') ||
          name.includes('venmo') ||
          name.includes('cash app') ||
          name.includes('cashapp') ||
          name.includes('paypal') ||
          merchantName.includes('zelle') ||
          merchantName.includes('venmo');

        if (!isP2P) {
          skipped++;
          continue;
        }

        const isIncoming = txn.amount < 0;
        const amountCents = Math.round(Math.abs(txn.amount) * 100);

        let source = 'manual';
        if (name.includes('zelle') || merchantName.includes('zelle')) source = 'zelle';
        else if (name.includes('venmo') || merchantName.includes('venmo')) source = 'venmo';
        else if (name.includes('cash app') || name.includes('cashapp')) source = 'cashapp';
        else if (name.includes('paypal')) source = 'paypal';

        let payerName = txn.merchant_name || txn.name || 'Unknown';
        payerName = payerName
          .replace(/^(zelle|venmo|cash app|cashapp|paypal)\s*(payment\s*)?(from|to)\s*/i, '')
          .trim();
        if (!payerName) payerName = 'Unknown';

        const existingPayment = await this.prisma.payment.findFirst({
          where: {
            orgId: conn.orgId,
            amountCents,
            paidAt: txn.date ? new Date(txn.date) : undefined,
            rawPayerName: { contains: payerName.split(' ')[0], mode: 'insensitive' },
          },
        });

        if (existingPayment) {
          skipped++;
          continue;
        }

        if (isIncoming) {
          await this.prisma.payment.create({
            data: {
              orgId: conn.orgId,
              amountCents,
              rawPayerName: payerName,
              source,
              paidAt: txn.date ? new Date(txn.date) : new Date(),
              memo: txn.name || undefined,
            },
          });
          imported++;
        } else {
          await this.prisma.expense.create({
            data: {
              orgId: conn.orgId,
              amountCents,
              title: payerName,
              vendor: payerName,
              category: 'OTHER',
              date: txn.date ? new Date(txn.date) : new Date(),
            },
          });
          imported++;
        }
      }
    }

    await this.prisma.plaidConnection.update({
      where: { id: conn.id },
      data: { cursor, lastSyncAt: new Date() },
    });

    return { imported, skipped };
  }

  async disconnect(connectionId: string): Promise<void> {
    const conn = await this.prisma.plaidConnection.findUnique({ where: { id: connectionId } });
    if (!conn) return;

    if (this.client) {
      try {
        await this.client.itemRemove({ access_token: conn.accessToken });
      } catch {}
    }

    await this.prisma.plaidConnection.delete({ where: { id: connectionId } });
  }

  async getConnections(orgId: string) {
    return this.prisma.plaidConnection.findMany({
      where: { orgId },
      select: {
        id: true,
        institutionName: true,
        accountMask: true,
        accountName: true,
        lastSyncAt: true,
        isActive: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
