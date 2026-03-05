import { Injectable, Logger, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { google, gmail_v1, Auth } from 'googleapis';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailParserService } from './email-parser.service';
import { PaymentMatcherService } from './payment-matcher.service';
import { ExpenseMatcherService } from './expense-matcher.service';
import { ChargesService } from '../charges/charges.service';
import { AuditService } from '../audit/audit.service';
import { sanitizeText } from '../../common/utils/sanitize';

function formatSourceName(source: string): string {
  const map: Record<string, string> = {
    venmo: 'Venmo',
    zelle: 'Zelle',
    cashapp: 'Cash App',
    paypal: 'PayPal',
    square: 'Square',
  };
  return map[source?.toLowerCase()] || source || 'Unknown';
}

function createConcurrencyLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      const run = () => {
        active++;
        fn()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            active--;
            if (queue.length > 0) queue.shift()!();
          });
      };
      if (active < concurrency) run();
      else queue.push(run);
    });
}

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);
  private oauth2Client: Auth.OAuth2Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly emailParser: EmailParserService,
    private readonly paymentMatcher: PaymentMatcherService,
    private readonly expenseMatcher: ExpenseMatcherService,
    private readonly chargesService: ChargesService,
    private readonly auditService: AuditService,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.get<string>('GOOGLE_REDIRECT_URI'),
    );
  }

  private signState(payload: { orgId: string; returnTo?: string | null }): string {
    const data = JSON.stringify(payload);
    const secret = this.configService.get<string>('JWT_SECRET', '');
    const sig = createHmac('sha256', secret).update(data).digest('hex');
    return `${Buffer.from(data).toString('base64')}.${sig}`;
  }

  parseAndVerifyState(stateParam: string): { orgId: string; returnTo: string | null } {
    const secret = this.configService.get<string>('JWT_SECRET', '');
    const dotIdx = stateParam.lastIndexOf('.');
    if (dotIdx === -1) throw new BadRequestException('Invalid OAuth state');

    const dataB64 = stateParam.slice(0, dotIdx);
    const sig = stateParam.slice(dotIdx + 1);

    const data = Buffer.from(dataB64, 'base64').toString('utf-8');
    const expectedSig = createHmac('sha256', secret).update(data).digest('hex');

    if (
      sig.length !== expectedSig.length ||
      !timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))
    ) {
      throw new BadRequestException('Invalid OAuth state signature');
    }

    const parsed = JSON.parse(data);
    return { orgId: parsed.orgId, returnTo: parsed.returnTo || null };
  }

  getAuthUrl(params: { orgId: string; returnTo?: string | null }): string {
    const scopes = ['https://www.googleapis.com/auth/gmail.readonly'];
    const state = this.signState(params);

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      state,
    });
  }

  async handleCallback(
    code: string,
    orgId: string,
  ): Promise<{ email: string }> {
    const { tokens } = await this.oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new UnauthorizedException('Failed to get tokens from Google');
    }

    // Get the user's email
    this.oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const email = profile.data.emailAddress;

    if (!email) {
      throw new UnauthorizedException('Failed to get email from Google');
    }

    // Check if this Gmail is already connected to another org
    const existing = await this.prisma.gmailConnection.findFirst({
      where: { email, orgId: { not: orgId } },
    });
    if (existing) {
      throw new BadRequestException('This Gmail account is already connected to another organization.');
    }

    // Store the connection
    const connection = await this.prisma.gmailConnection.upsert({
      where: { orgId },
      update: {
        email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(tokens.expiry_date || Date.now() + 3600000),
        isActive: true,
      },
      create: {
        orgId,
        email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(tokens.expiry_date || Date.now() + 3600000),
      },
    });

    // Audit log for Gmail connect (best-effort, no authenticated user in OAuth redirect)
    const adminMembership = await this.prisma.membership.findFirst({
      where: { orgId, role: { in: ['ADMIN', 'TREASURER'] }, status: 'ACTIVE' },
      select: { id: true },
    });
    await this.auditService.logCreate(orgId, adminMembership?.id, 'GMAIL_CONNECTION', connection.id, {
      email,
    }).catch((err) => this.logger.warn(`Audit log failed: ${err.message}`));

    // Auto-sync after connecting (fire-and-forget so redirect isn't blocked)
    this.syncEmails(orgId).catch((err) => {
      this.logger.warn(`Auto-sync after Gmail connect failed for org ${orgId}: ${err.message}`);
    });

    return { email };
  }

  async getConnection(orgId: string) {
    return this.prisma.gmailConnection.findUnique({
      where: { orgId },
    });
  }

  async disconnect(orgId: string, actorId?: string) {
    const connection = await this.prisma.gmailConnection.findUnique({
      where: { orgId },
      select: { id: true, email: true },
    });

    await this.prisma.gmailConnection.delete({
      where: { orgId },
    });

    if (connection) {
      await this.auditService.logDelete(orgId, actorId, 'GMAIL_CONNECTION', connection.id, {
        email: connection.email,
      }).catch((err) => this.logger.warn(`Audit log failed: ${err.message}`));
    }
  }

  async syncEmails(orgId: string): Promise<{
    imported: number;
    skipped: number;
    autoConfirmed: number;
    needsReview: number;
  }> {
    const connection = await this.prisma.gmailConnection.findUnique({
      where: { orgId },
    });

    if (!connection || !connection.isActive) {
      throw new Error('No active Gmail connection');
    }

    // Fetch org auto-approve settings and enabled payment sources
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { autoApprovePayments: true, autoApproveExpenses: true, enabledPaymentSources: true },
    });

    const autoApprovePayments = org?.autoApprovePayments ?? true;
    const autoApproveExpenses = org?.autoApproveExpenses ?? true;
    const enabledSources = org?.enabledPaymentSources ?? ['venmo', 'zelle', 'cashapp', 'paypal'];

    // Refresh token if needed
    const gmail = await this.getGmailClient(connection);

    // Search for payment emails filtered by enabled sources
    const query = this.buildSearchQuery(enabledSources);
    if (!query) {
      return { imported: 0, skipped: 0, autoConfirmed: 0, needsReview: 0 };
    }
    const messages = await this.listMessages(gmail, query);

    // Create a shared batch context for all auto-imports in this sync
    const syncBatch = this.auditService.createBatchContext('Gmail auto-import');

    let imported = 0;
    let skipped = 0;

    // Process messages concurrently with a limiter to avoid overwhelming the API
    const limit = createConcurrencyLimiter(5);
    const results = await Promise.allSettled(
      messages.map((message) =>
        limit(() => this.processMessage(gmail, connection, message.id!, { autoApprovePayments, autoApproveExpenses }, syncBatch)),
      ),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value === 'imported') imported++;
        else skipped++;
      } else {
        this.logger.error(`Failed to process email: ${result.reason}`);
        skipped++;
      }
    }

    // Update last sync time
    await this.prisma.gmailConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date() },
    });

    // Count auto-confirmed vs needs review from this sync
    const recentImports = await this.prisma.emailImport.findMany({
      where: {
        gmailConnectionId: connection.id,
        createdAt: { gte: new Date(Date.now() - 60000) }, // Last minute
      },
      select: { status: true },
    });

    const autoConfirmed = recentImports.filter(i => i.status === 'AUTO_CONFIRMED').length;
    const needsReview = recentImports.filter(i => i.status === 'PENDING').length;

    // Update batch description with actual count
    if (autoConfirmed > 0) {
      await this.prisma.auditLog.updateMany({
        where: { orgId, batchId: syncBatch.batchId },
        data: { batchDescription: `Gmail auto-import: ${autoConfirmed} item${autoConfirmed !== 1 ? 's' : ''}` },
      }).catch((err) => this.logger.warn(`Audit log failed: ${err.message}`));
    }

    return { imported, skipped, autoConfirmed, needsReview };
  }

  private async getGmailClient(connection: {
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: Date;
    id: string;
  }): Promise<gmail_v1.Gmail> {
    this.oauth2Client.setCredentials({
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken,
      expiry_date: connection.tokenExpiresAt.getTime(),
    });

    // Check if token needs refresh
    if (new Date() >= connection.tokenExpiresAt) {
      const { credentials } = await this.oauth2Client.refreshAccessToken();

      await this.prisma.gmailConnection.update({
        where: { id: connection.id },
        data: {
          accessToken: credentials.access_token!,
          tokenExpiresAt: new Date(credentials.expiry_date!),
        },
      });
    }

    return google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  private buildSearchQuery(enabledSources: string[]): string {
    const sourceMap: Record<string, string[]> = {
      venmo: ['from:venmo.com', 'from:venmo@venmo.com'],
      zelle: ['from:zelle', 'from:zellepay'],
      cashapp: ['from:cash.app', 'from:square.com'],
      paypal: ['from:paypal.com', 'from:service@paypal.com'],
    };

    const senders = enabledSources.flatMap((source) => sourceMap[source] || []);

    if (senders.length === 0) {
      return '';
    }

    const senderQuery = `(${senders.join(' OR ')})`;

    // Extended to 30 days, no subject filter (parser will validate)
    return `${senderQuery} newer_than:30d`;
  }

  private async listMessages(
    gmail: gmail_v1.Gmail,
    query: string,
  ): Promise<gmail_v1.Schema$Message[]> {
    const messages: gmail_v1.Schema$Message[] = [];
    let pageToken: string | undefined;

    do {
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 50,
        pageToken,
      });

      if (response.data.messages) {
        messages.push(...response.data.messages);
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken && messages.length < 200); // Limit to 200 messages

    return messages;
  }

  private async processMessage(
    gmail: gmail_v1.Gmail,
    connection: { id: string; orgId: string },
    messageId: string,
    flags: { autoApprovePayments: boolean; autoApproveExpenses: boolean },
    syncBatch?: import('../audit/audit.service').BatchContext,
  ): Promise<'imported' | 'skipped'> {
    // Check if already processed
    const existing = await this.prisma.emailImport.findUnique({
      where: {
        gmailConnectionId_messageId: {
          gmailConnectionId: connection.id,
          messageId,
        },
      },
    });

    if (existing) {
      return 'skipped';
    }

    // Fetch full message
    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const headers = message.data.payload?.headers || [];
    const from = headers.find((h) => h.name?.toLowerCase() === 'from')?.value || '';
    const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value || '';
    const dateStr = headers.find((h) => h.name?.toLowerCase() === 'date')?.value;
    const emailDate = dateStr ? new Date(dateStr) : new Date();

    // Get body text and snippet
    const body = this.extractBody(message.data.payload);
    const snippet = message.data.snippet || '';

    // Parse the email (pass snippet for memo extraction fallback)
    const parsed = this.emailParser.parseEmail(from, subject, body, snippet);

    if (!parsed) {
      // Not a payment email we can parse
      return 'skipped';
    }

    // Sanitize user-derived fields before any DB writes
    parsed.payerName = sanitizeText(parsed.payerName);
    parsed.memo = sanitizeText(parsed.memo);

    // Handle OUTGOING payments as expenses
    if (parsed.direction === 'outgoing') {
      return this.processOutgoingPayment(connection, messageId, message, from, subject, emailDate, parsed, flags.autoApproveExpenses, syncBatch);
    }

    // Handle INCOMING payments (existing logic)
    return this.processIncomingPayment(connection, messageId, message, from, subject, emailDate, parsed, flags.autoApprovePayments, syncBatch);
  }

  private async processOutgoingPayment(
    connection: { id: string; orgId: string },
    messageId: string,
    message: any,
    from: string,
    subject: string,
    emailDate: Date,
    parsed: {
      source: string;
      direction: string;
      amount: number | null;
      payerName: string | null;
      payerEmail: string | null;
      memo: string | null;
      transactionId: string | null;
    },
    autoApproveExpenses: boolean,
    syncBatch?: import('../audit/audit.service').BatchContext,
  ): Promise<'imported' | 'skipped'> {
    if (!parsed.amount) {
      return 'skipped';
    }

    // If auto-approve expenses is disabled, always send to inbox for review
    if (!autoApproveExpenses) {
      await this.prisma.emailImport.create({
        data: {
          orgId: connection.orgId,
          gmailConnectionId: connection.id,
          messageId,
          threadId: message.data.threadId || undefined,
          emailFrom: from,
          emailSubject: subject,
          emailDate,
          emailSnippet: message.data.snippet || undefined,
          parsedSource: parsed.source,
          parsedDirection: 'outgoing',
          parsedAmount: parsed.amount,
          parsedPayerName: parsed.payerName,
          parsedPayerEmail: parsed.payerEmail,
          parsedMemo: parsed.memo,
          status: 'PENDING',
          needsReviewReason: 'Auto-approve expenses is disabled',
        },
      });

      this.logger.log(
        `Outgoing payment of ${parsed.amount} cents sent to review (auto-approve disabled)`,
      );

      return 'imported';
    }

    // Check for similar existing expenses
    const matchResult = await this.expenseMatcher.matchExpense(
      connection.orgId,
      parsed.amount,
      emailDate,
      parsed.payerName,
      parsed.memo,
    );

    // If potential matches found, send to inbox for review
    if (matchResult.needsReview && matchResult.potentialMatches.length > 0) {
      await this.prisma.emailImport.create({
        data: {
          orgId: connection.orgId,
          gmailConnectionId: connection.id,
          messageId,
          threadId: message.data.threadId || undefined,
          emailFrom: from,
          emailSubject: subject,
          emailDate,
          emailSnippet: message.data.snippet || undefined,
          parsedSource: parsed.source,
          parsedDirection: 'outgoing',
          parsedAmount: parsed.amount,
          parsedPayerName: parsed.payerName,
          parsedPayerEmail: parsed.payerEmail,
          parsedMemo: parsed.memo,
          status: 'PENDING',
          matchedExpenseId: matchResult.matchedExpenseId,
          potentialExpenseIds: matchResult.potentialMatches.map(m => m.id),
          matchConfidence: matchResult.confidence,
          needsReviewReason: matchResult.reviewReason,
        },
      });

      this.logger.log(
        `Outgoing payment of ${parsed.amount} cents needs review - ${matchResult.potentialMatches.length} potential expense match(es) found`,
      );

      return 'imported';
    }

    // No matches found - auto-create new expense
    const adminMembership = await this.prisma.membership.findFirst({
      where: {
        orgId: connection.orgId,
        role: { in: ['ADMIN', 'TREASURER'] },
        status: 'ACTIVE',
      },
    });

    if (!adminMembership) {
      this.logger.warn(`No admin membership found for org ${connection.orgId}, creating expense without creator`);
    }

    const expense = await this.prisma.expense.create({
      data: {
        orgId: connection.orgId,
        category: 'OTHER',
        title: parsed.payerName || 'Unknown',
        description: parsed.memo || undefined,
        amountCents: parsed.amount,
        date: emailDate,
        vendor: formatSourceName(parsed.source),
        createdById: adminMembership?.id ?? null,
      },
    });

    await this.prisma.emailImport.create({
      data: {
        orgId: connection.orgId,
        gmailConnectionId: connection.id,
        messageId,
        threadId: message.data.threadId || undefined,
        emailFrom: from,
        emailSubject: subject,
        emailDate,
        emailSnippet: message.data.snippet || undefined,
        parsedSource: parsed.source,
        parsedDirection: 'outgoing',
        parsedAmount: parsed.amount,
        parsedPayerName: parsed.payerName,
        parsedPayerEmail: parsed.payerEmail,
        parsedMemo: parsed.memo,
        status: 'AUTO_CONFIRMED',
        expenseId: expense.id,
        reviewedAt: new Date(),
      },
    });

    // Audit log for auto-created expense (grouped in sync batch)
    await this.auditService.logCreate(connection.orgId, adminMembership?.id, 'EXPENSE', expense.id, {
      amountCents: expense.amountCents,
      title: expense.title,
      source: 'gmail_auto_import',
    }, syncBatch).catch((err) => this.logger.warn(`Audit log failed: ${err.message}`));

    this.logger.log(
      `Auto-created expense of ${parsed.amount} cents to ${parsed.payerName} from ${parsed.source}`,
    );

    return 'imported';
  }

  private async processIncomingPayment(
    connection: { id: string; orgId: string },
    messageId: string,
    message: any,
    from: string,
    subject: string,
    emailDate: Date,
    parsed: {
      source: string;
      direction: string;
      amount: number | null;
      payerName: string | null;
      payerEmail: string | null;
      memo: string | null;
      transactionId: string | null;
    },
    autoApprovePayments: boolean,
    syncBatch?: import('../audit/audit.service').BatchContext,
  ): Promise<'imported' | 'skipped'> {
    // If auto-approve payments is disabled, always send to inbox for review
    if (!autoApprovePayments) {
      await this.prisma.emailImport.create({
        data: {
          orgId: connection.orgId,
          gmailConnectionId: connection.id,
          messageId,
          threadId: message.data.threadId || undefined,
          emailFrom: from,
          emailSubject: subject,
          emailDate,
          emailSnippet: message.data.snippet || undefined,
          parsedSource: parsed.source,
          parsedDirection: 'incoming',
          parsedAmount: parsed.amount,
          parsedPayerName: parsed.payerName,
          parsedPayerEmail: parsed.payerEmail,
          parsedMemo: parsed.memo,
          status: 'PENDING',
          needsReviewReason: 'Auto-approve payments is disabled',
        },
      });

      this.logger.log(
        `Payment from ${parsed.payerName} sent to review (auto-approve disabled)`,
      );

      return 'imported';
    }

    // Try to auto-match the payment to a member
    const matchResult = await this.paymentMatcher.matchPayment(
      connection.orgId,
      parsed.payerName,
      parsed.payerEmail,
      parsed.memo,
      parsed.amount || 0,
    );

    // If confident match, auto-create payment
    if (!matchResult.needsReview && matchResult.membershipId && parsed.amount) {
      const externalId = `email:${messageId}`;

      // Check if payment already exists with this externalId
      const existingPayment = await this.prisma.payment.findFirst({
        where: { orgId: connection.orgId, externalId },
      });

      if (existingPayment) {
        // Payment already exists, skip creating but still record the import
        await this.prisma.emailImport.create({
          data: {
            orgId: connection.orgId,
            gmailConnectionId: connection.id,
            messageId,
            threadId: message.data.threadId || undefined,
            emailFrom: from,
            emailSubject: subject,
            emailDate,
            emailSnippet: message.data.snippet || undefined,
            parsedSource: parsed.source,
            parsedDirection: 'incoming',
            parsedAmount: parsed.amount,
            parsedPayerName: parsed.payerName,
            parsedPayerEmail: parsed.payerEmail,
            parsedMemo: parsed.memo,
            status: 'AUTO_CONFIRMED',
            matchedMembershipId: matchResult.membershipId,
            matchConfidence: matchResult.confidence,
            paymentId: existingPayment.id,
          },
        });
        return 'imported';
      }

      // Wrap payment creation + allocation loop + email import in one transaction
      const { allocatedChargeIds } = await this.prisma.$transaction(async (tx) => {
        const payment = await tx.payment.create({
          data: {
            orgId: connection.orgId,
            membershipId: matchResult.membershipId,
            amountCents: parsed.amount!,
            paidAt: emailDate,
            source: parsed.source,
            rawPayerName: parsed.payerName,
            memo: parsed.memo,
            externalId,
          },
        });

        // Auto-allocate to matching charges (only when confidence >= 0.9 + category match)
        const txAllocatedChargeIds: string[] = [];
        if (matchResult.shouldAutoAllocate && matchResult.suggestedChargeIds.length > 0) {
          let remainingAmount = parsed.amount!;

          for (const chargeId of matchResult.suggestedChargeIds) {
            if (remainingAmount <= 0) break;

            // Lock and read each charge row
            await tx.$queryRaw`SELECT 1 FROM charges WHERE id = ${chargeId} FOR UPDATE`;

            const charge = await tx.charge.findUnique({
              where: { id: chargeId },
              include: { allocations: { select: { amountCents: true } } },
            });

            if (!charge) continue;

            const allocatedCents = charge.allocations.reduce(
              (sum, a) => sum + a.amountCents,
              0,
            );
            const balanceDue = charge.amountCents - allocatedCents;

            if (balanceDue <= 0) continue;

            const allocationAmount = Math.min(remainingAmount, balanceDue);

            await tx.paymentAllocation.create({
              data: {
                orgId: connection.orgId,
                paymentId: payment.id,
                chargeId,
                amountCents: allocationAmount,
                createdById: matchResult.membershipId!,
              },
            });

            // Update charge status inside the transaction
            await this.chargesService.updateChargeStatus(chargeId, undefined, tx);

            txAllocatedChargeIds.push(chargeId);
            remainingAmount -= allocationAmount;
          }
        }

        // Create email import record inside the transaction
        await tx.emailImport.create({
          data: {
            orgId: connection.orgId,
            gmailConnectionId: connection.id,
            messageId,
            threadId: message.data.threadId || undefined,
            emailFrom: from,
            emailSubject: subject,
            emailDate,
            emailSnippet: message.data.snippet || undefined,
            parsedSource: parsed.source,
            parsedDirection: 'incoming',
            parsedAmount: parsed.amount,
            parsedPayerName: parsed.payerName,
            parsedPayerEmail: parsed.payerEmail,
            parsedMemo: parsed.memo,
            status: 'AUTO_CONFIRMED',
            paymentId: payment.id,
            reviewedAt: new Date(),
            matchedMembershipId: matchResult.membershipId,
            matchConfidence: matchResult.confidence,
            derivedCategory: matchResult.derivedCategory,
            allocatedChargeIds: txAllocatedChargeIds,
          },
        });

        return { allocatedChargeIds: txAllocatedChargeIds };
      });

      // Audit log for auto-confirmed payment (best-effort)
      const adminMembership = await this.prisma.membership.findFirst({
        where: { orgId: connection.orgId, role: { in: ['ADMIN', 'TREASURER'] }, status: 'ACTIVE' },
        select: { id: true },
      });
      const actorForAudit = adminMembership?.id;

      // Find the payment created in the transaction
      const autoPayment = await this.prisma.emailImport.findFirst({
        where: { gmailConnectionId: connection.id, messageId },
        select: { paymentId: true },
      });
      if (autoPayment?.paymentId) {
        await this.auditService.logCreate(connection.orgId, actorForAudit, 'PAYMENT', autoPayment.paymentId, {
          amountCents: parsed.amount,
          paidAt: emailDate,
          rawPayerName: parsed.payerName,
          source: 'gmail_auto_import',
        }, syncBatch).catch((err) => this.logger.warn(`Audit log failed: ${err.message}`));
      }

      this.logger.log(
        `Auto-confirmed payment of ${parsed.amount} cents from ${parsed.payerName} (confidence: ${matchResult.confidence})`,
      );
    } else {
      // Needs manual review - create as PENDING
      await this.prisma.emailImport.create({
        data: {
          orgId: connection.orgId,
          gmailConnectionId: connection.id,
          messageId,
          threadId: message.data.threadId || undefined,
          emailFrom: from,
          emailSubject: subject,
          emailDate,
          emailSnippet: message.data.snippet || undefined,
          parsedSource: parsed.source,
          parsedDirection: 'incoming',
          parsedAmount: parsed.amount,
          parsedPayerName: parsed.payerName,
          parsedPayerEmail: parsed.payerEmail,
          parsedMemo: parsed.memo,
          status: 'PENDING',
          matchedMembershipId: matchResult.membershipId,
          matchConfidence: matchResult.confidence,
          needsReviewReason: matchResult.reviewReason,
          derivedCategory: matchResult.derivedCategory,
        },
      });

      this.logger.log(
        `Payment from ${parsed.payerName} needs review: ${matchResult.reviewReason}`,
      );
    }

    return 'imported';
  }

  private extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
    if (!payload) return '';

    // Check for plain text part
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    // Check parts recursively
    if (payload.parts) {
      for (const part of payload.parts) {
        const body = this.extractBody(part);
        if (body) return body;
      }
    }

    // Fallback to body data if available
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    return '';
  }

  private async autoLearnAlias(membershipId: string, payerName: string): Promise<void> {
    try {
      const membership = await this.prisma.membership.findUnique({
        where: { id: membershipId },
        select: { name: true, paymentAliases: true, user: { select: { name: true } } },
      });

      if (!membership) return;

      const trimmed = payerName.trim();
      if (!trimmed) return;

      const lower = trimmed.toLowerCase();

      // Skip if it already matches membership name or user name
      if (membership.name?.toLowerCase() === lower) return;
      if (membership.user?.name?.toLowerCase() === lower) return;

      // Skip if already an existing alias
      if (membership.paymentAliases.some(a => a.toLowerCase() === lower)) return;

      // Cap at 20 aliases
      if (membership.paymentAliases.length >= 20) return;

      await this.prisma.membership.update({
        where: { id: membershipId },
        data: { paymentAliases: { push: trimmed } },
      });

      this.logger.log(`Auto-learned alias "${trimmed}" for membership ${membershipId}`);
    } catch (err) {
      this.logger.warn(`Failed to auto-learn alias: ${err.message}`);
    }
  }

  async getPendingImports(orgId: string, limit = 50) {
    return this.prisma.emailImport.findMany({
      where: {
        orgId,
        status: 'PENDING',
      },
      orderBy: { emailDate: 'desc' },
      take: limit,
    });
  }

  async getRecentAutoConfirmed(orgId: string, limit = 20) {
    return this.prisma.emailImport.findMany({
      where: {
        orgId,
        status: 'AUTO_CONFIRMED',
        reviewedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
      orderBy: { reviewedAt: 'desc' },
      take: limit,
    });
  }

  async getRecentConfirmed(orgId: string, limit = 50) {
    return this.prisma.emailImport.findMany({
      where: {
        orgId,
        status: { in: ['AUTO_CONFIRMED', 'CONFIRMED'] },
        reviewedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { reviewedAt: 'desc' },
      take: limit,
    });
  }

  async getIgnoredImports(orgId: string, limit = 50) {
    return this.prisma.emailImport.findMany({
      where: {
        orgId,
        status: 'IGNORED',
      },
      orderBy: { reviewedAt: 'desc' },
      take: limit,
    });
  }

  async unconfirmImport(importId: string) {
    const emailImport = await this.prisma.emailImport.findUnique({
      where: { id: importId },
    });

    if (!emailImport) {
      throw new NotFoundException('Import not found');
    }

    if (emailImport.status !== 'AUTO_CONFIRMED' && emailImport.status !== 'CONFIRMED') {
      throw new BadRequestException('Import is not confirmed');
    }

    // Wrap all deletions + emailImport reset in a single transaction
    // to prevent orphaned references (e.g. emailImport.paymentId pointing to a deleted payment)
    const affectedChargeIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      // If a payment was created, hard-delete it and its allocations
      if (emailImport.paymentId) {
        const payment = await tx.payment.findUnique({
          where: { id: emailImport.paymentId },
          include: { allocations: { select: { chargeId: true } } },
        });

        if (payment) {
          affectedChargeIds.push(...payment.allocations.map((a) => a.chargeId));
          await tx.paymentAllocation.deleteMany({ where: { paymentId: payment.id } });
          await tx.payment.delete({ where: { id: payment.id } });
        }
      }

      // If an expense was created, hard-delete it (matches payment pattern)
      if (emailImport.expenseId) {
        await tx.expense.delete({
          where: { id: emailImport.expenseId },
        }).catch(() => { /* ignore if already deleted */ });
      }

      // Reset the import back to PENDING
      await tx.emailImport.update({
        where: { id: importId },
        data: {
          status: 'PENDING',
          paymentId: null,
          expenseId: null,
          matchedMembershipId: null,
          matchConfidence: null,
          needsReviewReason: null,
          allocatedChargeIds: [],
          reviewedAt: null,
        },
      });
    });

    // Update charge statuses outside the transaction (best-effort)
    for (const chargeId of affectedChargeIds) {
      await this.chargesService.updateChargeStatus(chargeId);
    }
  }

  async getImportStats(orgId: string) {
    const [pending, autoConfirmed, confirmed, ignored] = await Promise.all([
      this.prisma.emailImport.count({ where: { orgId, status: 'PENDING' } }),
      this.prisma.emailImport.count({
        where: {
          orgId,
          status: 'AUTO_CONFIRMED',
          reviewedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.emailImport.count({
        where: {
          orgId,
          status: 'CONFIRMED',
          reviewedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.emailImport.count({
        where: {
          orgId,
          status: 'IGNORED',
          reviewedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return { pending, autoConfirmed, confirmed, ignored };
  }

  async confirmImport(importId: string, membershipId: string | null, actorId: string) {
    const emailImport = await this.prisma.emailImport.findUnique({
      where: { id: importId },
    });

    if (!emailImport) {
      throw new NotFoundException('Import not found');
    }

    if (emailImport.status !== 'PENDING') {
      throw new BadRequestException('Import has already been processed');
    }

    if (!emailImport.parsedAmount) {
      throw new BadRequestException('Cannot confirm import without parsed amount');
    }

    const externalId = `email:${emailImport.messageId}`;

    // Hard-delete any soft-deleted payment with this externalId (prevents duplicate on restore)
    await this.prisma.payment.deleteMany({
      where: { orgId: emailImport.orgId, externalId, deletedAt: { not: null } },
    });

    // Check if an active payment already exists with this externalId (idempotency guard)
    const existingActive = await this.prisma.payment.findFirst({
      where: { orgId: emailImport.orgId, externalId, deletedAt: null },
    });

    if (existingActive) {
      // Payment already exists — just link the import to it
      await this.prisma.emailImport.update({
        where: { id: importId },
        data: {
          status: 'CONFIRMED',
          paymentId: existingActive.id,
          reviewedAt: new Date(),
        },
      });
      return existingActive;
    }

    try {
      // Create the payment
      const payment = await this.prisma.payment.create({
        data: {
          orgId: emailImport.orgId,
          membershipId,
          amountCents: emailImport.parsedAmount,
          paidAt: emailImport.emailDate,
          source: emailImport.parsedSource || 'email',
          rawPayerName: emailImport.parsedPayerName,
          memo: emailImport.parsedMemo,
          externalId,
          createdById: actorId,
        },
      });

      // Update the import status
      await this.prisma.emailImport.update({
        where: { id: importId },
        data: {
          status: 'CONFIRMED',
          paymentId: payment.id,
          reviewedAt: new Date(),
        },
      });

      // Audit log for confirmed import payment
      await this.auditService.logCreate(emailImport.orgId, actorId, 'PAYMENT', payment.id, {
        amountCents: payment.amountCents,
        paidAt: payment.paidAt,
        rawPayerName: payment.rawPayerName,
        source: 'inbox_confirm',
      }).catch((err) => this.logger.warn(`Audit log failed: ${err.message}`));

      // Auto-learn payer name as alias for matched member
      if (membershipId && emailImport.parsedPayerName) {
        await this.autoLearnAlias(membershipId, emailImport.parsedPayerName);
      }

      return payment;
    } catch (error) {
      this.logger.error(`confirmImport failed for import ${importId}: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to confirm import: ${error.message}`);
    }
  }

  async ignoreImport(importId: string) {
    await this.prisma.emailImport.update({
      where: { id: importId },
      data: {
        status: 'IGNORED',
        reviewedAt: new Date(),
      },
    });
  }

  async restoreImport(importId: string) {
    await this.prisma.emailImport.update({
      where: { id: importId },
      data: {
        status: 'PENDING',
        reviewedAt: null,
      },
    });
  }

  async confirmExpenseImport(
    importId: string,
    actorId: string,
    options: {
      linkToExpenseId?: string; // Link to existing expense
      createNew?: boolean; // Create a new expense
    },
  ) {
    const emailImport = await this.prisma.emailImport.findUnique({
      where: { id: importId },
    });

    if (!emailImport || emailImport.status !== 'PENDING') {
      throw new BadRequestException('Import not found or already processed');
    }

    if (emailImport.parsedDirection !== 'outgoing') {
      throw new BadRequestException('This method is only for outgoing payments (expenses)');
    }

    if (!emailImport.parsedAmount) {
      throw new BadRequestException('Cannot confirm import without parsed amount');
    }

    let expenseId: string;

    if (options.linkToExpenseId) {
      // Link to existing expense - verify it exists
      const existingExpense = await this.prisma.expense.findFirst({
        where: { id: options.linkToExpenseId, orgId: emailImport.orgId },
      });

      if (!existingExpense) {
        throw new NotFoundException('Selected expense not found');
      }

      expenseId = existingExpense.id;

      this.logger.log(
        `Linked import to existing expense ${expenseId}`,
      );
    } else {
      // Create new expense
      const expense = await this.prisma.expense.create({
        data: {
          orgId: emailImport.orgId,
          category: 'OTHER',
          title: emailImport.parsedPayerName || 'Unknown',
          description: emailImport.parsedMemo || undefined,
          amountCents: emailImport.parsedAmount,
          date: emailImport.emailDate,
          vendor: formatSourceName(emailImport.parsedSource),
          createdById: actorId,
        },
      });

      expenseId = expense.id;

      this.logger.log(
        `Created new expense ${expenseId} from import`,
      );
    }

    // Update the import status
    await this.prisma.emailImport.update({
      where: { id: importId },
      data: {
        status: 'CONFIRMED',
        expenseId,
        reviewedAt: new Date(),
      },
    });

    // Audit log for confirmed expense import
    await this.auditService.logCreate(emailImport.orgId, actorId, 'EXPENSE', expenseId, {
      amountCents: emailImport.parsedAmount,
      title: emailImport.parsedPayerName || 'Unknown',
      source: 'inbox_confirm',
      linked: !!options.linkToExpenseId,
    }).catch((err) => this.logger.warn(`Audit log failed: ${err.message}`));

    return { expenseId };
  }

  async getPotentialExpenseMatches(importId: string) {
    const emailImport = await this.prisma.emailImport.findUnique({
      where: { id: importId },
    });

    if (!emailImport || !emailImport.potentialExpenseIds.length) {
      return [];
    }

    const expenses = await this.prisma.expense.findMany({
      where: {
        id: { in: emailImport.potentialExpenseIds },
      },
    });

    return expenses;
  }
}
