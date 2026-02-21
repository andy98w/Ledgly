import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, gmail_v1, Auth } from 'googleapis';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailParserService } from './email-parser.service';
import { PaymentMatcherService } from './payment-matcher.service';
import { ExpenseMatcherService } from './expense-matcher.service';
import { ChargesService } from '../charges/charges.service';

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
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.get<string>('GOOGLE_REDIRECT_URI'),
    );
  }

  getAuthUrl(orgId: string): string {
    const scopes = ['https://www.googleapis.com/auth/gmail.readonly'];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      state: orgId,
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

    // Store the connection
    await this.prisma.gmailConnection.upsert({
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

    return { email };
  }

  async getConnection(orgId: string) {
    return this.prisma.gmailConnection.findUnique({
      where: { orgId },
    });
  }

  async disconnect(orgId: string) {
    await this.prisma.gmailConnection.delete({
      where: { orgId },
    });
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

    // Refresh token if needed
    const gmail = await this.getGmailClient(connection);

    // Search for payment emails
    const query = this.buildSearchQuery();
    const messages = await this.listMessages(gmail, query);

    let imported = 0;
    let skipped = 0;

    for (const message of messages) {
      const result = await this.processMessage(gmail, connection, message.id!);
      if (result === 'imported') {
        imported++;
      } else {
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

  private buildSearchQuery(): string {
    // Search for payment notification emails from last 30 days
    // Only filter by sender - let the parser determine if it's a valid payment
    const senders = [
      'from:venmo.com',
      'from:venmo@venmo.com',
      'from:zelle',
      'from:zellepay',
      'from:cash.app',
      'from:square.com',
      'from:paypal.com',
      'from:service@paypal.com',
    ];

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

    // Get body text
    const body = this.extractBody(message.data.payload);

    // Parse the email
    const parsed = this.emailParser.parseEmail(from, subject, body);

    if (!parsed) {
      // Not a payment email we can parse
      return 'skipped';
    }

    // Handle OUTGOING payments as expenses
    if (parsed.direction === 'outgoing') {
      return this.processOutgoingPayment(connection, messageId, message, from, subject, emailDate, parsed);
    }

    // Handle INCOMING payments (existing logic)
    return this.processIncomingPayment(connection, messageId, message, from, subject, emailDate, parsed);
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
  ): Promise<'imported' | 'skipped'> {
    if (!parsed.amount) {
      return 'skipped';
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
        title: `${parsed.source.toUpperCase()} payment to ${parsed.payerName || 'Unknown'}`,
        description: parsed.memo || undefined,
        amountCents: parsed.amount,
        date: emailDate,
        vendor: parsed.payerName || undefined,
        createdById: adminMembership?.id || '',
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
  ): Promise<'imported' | 'skipped'> {
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

      // Create the payment
      const payment = await this.prisma.payment.create({
        data: {
          orgId: connection.orgId,
          membershipId: matchResult.membershipId,
          amountCents: parsed.amount,
          paidAt: emailDate,
          source: parsed.source,
          rawPayerName: parsed.payerName,
          memo: parsed.memo,
          externalId,
        },
      });

      // Auto-allocate to matching charges
      const allocatedChargeIds: string[] = [];
      if (matchResult.suggestedChargeIds.length > 0) {
        let remainingAmount = parsed.amount;

        for (const chargeId of matchResult.suggestedChargeIds) {
          if (remainingAmount <= 0) break;

          // Get charge with current allocations
          const charge = await this.prisma.charge.findUnique({
            where: { id: chargeId },
            include: {
              allocations: { select: { amountCents: true } },
            },
          });

          if (!charge) continue;

          const allocatedCents = charge.allocations.reduce(
            (sum, a) => sum + a.amountCents,
            0,
          );
          const balanceDue = charge.amountCents - allocatedCents;

          if (balanceDue <= 0) continue;

          const allocationAmount = Math.min(remainingAmount, balanceDue);

          // Create allocation
          await this.prisma.paymentAllocation.create({
            data: {
              orgId: connection.orgId,
              paymentId: payment.id,
              chargeId,
              amountCents: allocationAmount,
              createdById: matchResult.membershipId,
            },
          });

          // Update charge status
          await this.chargesService.updateChargeStatus(chargeId);

          allocatedChargeIds.push(chargeId);
          remainingAmount -= allocationAmount;
        }
      }

      // Create email import record as AUTO_CONFIRMED
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
          paymentId: payment.id,
          reviewedAt: new Date(),
          matchedMembershipId: matchResult.membershipId,
          matchConfidence: matchResult.confidence,
          derivedCategory: matchResult.derivedCategory,
          allocatedChargeIds,
        },
      });

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

    if (!emailImport || emailImport.status !== 'PENDING') {
      throw new Error('Import not found or already processed');
    }

    if (!emailImport.parsedAmount) {
      throw new Error('Cannot confirm import without parsed amount');
    }

    // Create the payment
    const payment = await this.prisma.payment.create({
      data: {
        orgId: emailImport.orgId,
        membershipId,
        amountCents: emailImport.parsedAmount,
        paidAt: emailImport.emailDate,
        source: emailImport.parsedSource,
        rawPayerName: emailImport.parsedPayerName,
        memo: emailImport.parsedMemo,
        externalId: `email:${emailImport.messageId}`,
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

    return payment;
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
      throw new Error('Import not found or already processed');
    }

    if (emailImport.parsedDirection !== 'outgoing') {
      throw new Error('This method is only for outgoing payments (expenses)');
    }

    if (!emailImport.parsedAmount) {
      throw new Error('Cannot confirm import without parsed amount');
    }

    let expenseId: string;

    if (options.linkToExpenseId) {
      // Link to existing expense - verify it exists
      const existingExpense = await this.prisma.expense.findFirst({
        where: { id: options.linkToExpenseId, orgId: emailImport.orgId },
      });

      if (!existingExpense) {
        throw new Error('Selected expense not found');
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
          title: `${emailImport.parsedSource.toUpperCase()} payment to ${emailImport.parsedPayerName || 'Unknown'}`,
          description: emailImport.parsedMemo || undefined,
          amountCents: emailImport.parsedAmount,
          date: emailImport.emailDate,
          vendor: emailImport.parsedPayerName || undefined,
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
