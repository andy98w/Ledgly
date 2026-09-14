import { Injectable, Logger, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { DurableJobsService } from '../jobs/durable-jobs.service';
import { recordPaymentNotice } from '../notifications/payment-outbox';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { google, gmail_v1, Auth } from 'googleapis';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailParserService } from './email-parser.service';
import { PaymentMatcherService } from './payment-matcher.service';
import { ExpenseMatcherService } from './expense-matcher.service';
import { ChargesService } from '../charges/charges.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../auth/email.service';
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
    private readonly emailService: EmailService,
    private readonly jobs: DurableJobsService,
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

    this.oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const email = profile.data.emailAddress;

    if (!email) {
      throw new UnauthorizedException('Failed to get email from Google');
    }

    const connection = await this.prisma.gmailConnection.upsert({
      where: { orgId_email: { orgId, email } },
      update: {
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

    const adminMembership = await this.prisma.membership.findFirst({
      where: { orgId, role: { in: ['ADMIN', 'TREASURER'] }, status: 'ACTIVE' },
      select: { id: true },
    });
    await this.auditService.logCreate(orgId, adminMembership?.id, 'GMAIL_CONNECTION', connection.id, {
      email,
    }).catch((err) => this.logger.warn(`Audit log failed: ${err.message}`));

    // Auto-sync after connecting (fire-and-forget so redirect isn't blocked)
    this.requestSync(orgId).catch((err) => {
      this.logger.warn(`Auto-sync after Gmail connect failed for org ${orgId}: ${err.message}`);
    });

    return { email };
  }

  async getConnections(orgId: string) {
    return this.prisma.gmailConnection.findMany({
      where: { orgId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async disconnect(connectionId: string, actorId?: string) {
    const connection = await this.prisma.gmailConnection.findUnique({
      where: { id: connectionId },
      select: { id: true, orgId: true, email: true },
    });

    if (!connection) {
      throw new NotFoundException('Gmail connection not found');
    }

    await this.prisma.gmailConnection.delete({
      where: { id: connectionId },
    });

    await this.auditService.logDelete(connection.orgId, actorId, 'GMAIL_CONNECTION', connection.id, {
      email: connection.email,
    }).catch((err) => this.logger.warn(`Audit log failed: ${err.message}`));
  }

  async assertOwned(orgId:string,id:string,kind:'connection'|'import') {
    const found=kind==='connection'
      ? await this.prisma.gmailConnection.findFirst({where:{id,orgId},select:{id:true}})
      : await this.prisma.emailImport.findFirst({where:{id,orgId},select:{id:true}});
    if(!found) throw new NotFoundException('Gmail record not found');
  }

  async requestSync(orgId: string) {
    if (this.configService.get('DURABLE_GMAIL_ENABLED') !== 'true') return this.syncEmails(orgId);
    const connections=await this.prisma.gmailConnection.findMany({where:{orgId,isActive:true},select:{id:true}});
    if (!connections.length) throw new NotFoundException('No active Gmail connection');
    const bucket=Math.floor(Date.now()/60000);
    const jobIds=await Promise.all(connections.map(c=>this.jobs.enqueue(orgId,`gmail-scan:${c.id}:${bucket}`,{connectionId:c.id,scanId:String(bucket)},'gmail-scan')));
    return {queued:true,jobIds,imported:0,skipped:0,autoConfirmed:0};
  }

  async runScan(orgId: string, payload: Record<string,unknown>) {
    if (typeof payload.connectionId !== 'string') throw new Error('Invalid scan');
    const connection=await this.prisma.gmailConnection.findFirst({where:{id:payload.connectionId,orgId,isActive:true}});
    if (!connection) return;
    const org=await this.prisma.organization.findUniqueOrThrow({where:{id:orgId}});
    const query=typeof payload.query==='string'?payload.query:this.buildSearchQuery(org.enabledPaymentSources,org.gmailSyncAfter ?? undefined);
    if (!query) return;
    const gmail=await this.getGmailClient(connection);
    const response=await gmail.users.messages.list({userId:'me',q:query,maxResults:50,pageToken:typeof payload.pageToken==='string'?payload.pageToken:undefined},{timeout:15000});
    // One page commits with its continuation so crashes cannot lose later pages.
    await this.prisma.$transaction(async tx=>{
      for (const m of response.data.messages || []) {
        if (!m.id) continue;
        const key='gmail-msg:'+createHash('sha256').update(connection.id+':'+m.id).digest('hex');
        await this.jobs.enqueue(orgId,key,{connectionId:connection.id,messageId:m.id},'gmail-message',tx);
      }
      if (response.data.nextPageToken) {
        const next=response.data.nextPageToken;
        const key='gmail-page:'+createHash('sha256').update(connection.id+':'+next+':'+String(payload.scanId)).digest('hex');
        await this.jobs.enqueue(orgId,key,{connectionId:connection.id,pageToken:next,scanId:payload.scanId,query},'gmail-scan',tx);
      }
      if (!response.data.nextPageToken) await tx.gmailConnection.update({where:{id:connection.id},data:{lastSyncAt:new Date()}});
    });
  }

  async runMessage(orgId: string, payload: Record<string,unknown>) {
    if (typeof payload.connectionId !== 'string' || typeof payload.messageId !== 'string') throw new Error('Invalid Gmail message');
    const c=await this.prisma.gmailConnection.findFirst({where:{id:payload.connectionId,orgId,isActive:true}});
    if (!c) return;
    const gmail=await this.getGmailClient(c);
    await this.processMessage(gmail,c,payload.messageId);
  }

  async syncEmails(orgId: string): Promise<{
    imported: number;
    skipped: number;
    autoConfirmed: number;
  }> {
    const connections = await this.prisma.gmailConnection.findMany({
      where: { orgId, isActive: true },
    });

    if (connections.length === 0) {
      throw new Error('No active Gmail connection');
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { enabledPaymentSources: true, gmailSyncAfter: true },
    });

    const enabledSources = org?.enabledPaymentSources ?? ['venmo', 'zelle', 'cashapp', 'paypal'];
    const query = this.buildSearchQuery(enabledSources, org?.gmailSyncAfter ?? undefined);
    if (!query) {
      return { imported: 0, skipped: 0, autoConfirmed: 0 };
    }

    const syncBatch = this.auditService.createBatchContext('Gmail auto-import');
    let imported = 0;
    let skipped = 0;
    let failures = 0;

    for (const connection of connections) {
      try {
        const gmail = await this.getGmailClient(connection);
        const messages = await this.listMessages(gmail, query);

        const limit = createConcurrencyLimiter(5);
        const results = await Promise.allSettled(
          messages.map((message) =>
            limit(() => this.processMessage(gmail, connection, message.id!, syncBatch)),
          ),
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            if (result.value === 'imported') imported++;
            else skipped++;
          } else {
            this.logger.error(`Failed to process email: ${result.reason}`);
            failures++;
          }
        }

        await this.prisma.gmailConnection.update({
          where: { id: connection.id },
          data: { lastSyncAt: new Date() },
        });
      } catch (err: any) {
        failures++;
        this.logger.error('Gmail connection sync failed');

        if (err.message?.includes('invalid_grant') || err.message?.includes('Token has been expired')) {
          this.notifyBrokenConnection(orgId, connection.email).catch(() => {});
        }
      }
    }

    if (imported > 0) {
      await this.prisma.auditLog.updateMany({
        where: { orgId, batchId: syncBatch.batchId },
        data: { batchDescription: `Gmail auto-import: ${imported} item${imported !== 1 ? 's' : ''}` },
      }).catch((err) => this.logger.warn(`Audit log failed: ${err.message}`));
    }

    if (failures) throw new Error('Gmail sync incomplete; retry required');
    return { imported, skipped, autoConfirmed: imported };
  }

  private async getGmailClient(connection: {
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: Date;
    id: string;
  }): Promise<gmail_v1.Gmail> {
    const client = new google.auth.OAuth2({clientId:this.configService.get('GOOGLE_CLIENT_ID'),clientSecret:this.configService.get('GOOGLE_CLIENT_SECRET'),redirectUri:this.configService.get('GOOGLE_REDIRECT_URI'),transporterOptions:{timeout:15000}});
    client.setCredentials({
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken,
      expiry_date: connection.tokenExpiresAt.getTime(),
    });

    if (new Date() >= connection.tokenExpiresAt) {
      const { credentials } = await client.refreshAccessToken();

      await this.prisma.gmailConnection.update({
        where: { id: connection.id },
        data: {
          accessToken: credentials.access_token!,
          tokenExpiresAt: new Date(credentials.expiry_date!),
        },
      });
    }

    return google.gmail({ version: 'v1', auth: client });
  }

  private buildSearchQuery(enabledSources: string[], syncAfter?: Date): string {
    const sourceMap: Record<string, string[]> = {
      venmo: ['from:venmo.com', 'from:venmo@venmo.com'],
      zelle: ['from:zelle', 'from:zellepay', 'from:ealerts.bankofamerica.com', 'from:chase.com', 'from:wellsfargo.com', 'from:citibank.com', 'from:usbank.com', 'from:capitalone.com', 'from:pnc.com'],
      cashapp: ['from:cash.app', 'from:square.com'],
      paypal: ['from:paypal.com', 'from:service@paypal.com'],
    };

    const senders = enabledSources.flatMap((source) => sourceMap[source] || []);

    if (senders.length === 0) {
      return '';
    }

    const senderQuery = `(${senders.join(' OR ')})`;

    if (syncAfter) {
      const y = syncAfter.getFullYear();
      const m = syncAfter.getMonth() + 1;
      const d = syncAfter.getDate();
      return `${senderQuery} after:${y}/${m}/${d}`;
    }

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
    syncBatch?: import('../audit/audit.service').BatchContext,
  ): Promise<'imported' | 'skipped'> {
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

    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    }, {timeout:15000});

    const headers = message.data.payload?.headers || [];
    const from = headers.find((h) => h.name?.toLowerCase() === 'from')?.value || '';
    const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value || '';
    const dateStr = headers.find((h) => h.name?.toLowerCase() === 'date')?.value;
    const emailDate = dateStr ? new Date(dateStr) : new Date();

    const body = this.extractBody(message.data.payload);
    const snippet = message.data.snippet || '';

    const parsed = this.emailParser.parseEmail(from, subject, body, snippet);

    if (!parsed) {
      return 'skipped';
    }

    parsed.payerName = sanitizeText(parsed.payerName);
    parsed.memo = sanitizeText(parsed.memo);

    if (!parsed.amount || !Number.isSafeInteger(parsed.amount) || parsed.amount < 1 || parsed.amount > 99_999_999 || !Number.isFinite(emailDate.getTime())) return 'skipped';
    return this.prisma.$transaction(async tx => {
      // Serialize imports per organization, including outgoing duplicate matching.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${connection.orgId}))::text`;
      const active = await tx.gmailConnection.findFirst({where:{id:connection.id,orgId:connection.orgId,isActive:true}});
      if (!active) return 'skipped';
      const seen = await tx.emailImport.findUnique({where:{gmailConnectionId_messageId:{gmailConnectionId:connection.id,messageId}}});
      if (seen) return 'skipped';
      const result = parsed.direction === 'outgoing'
        ? await this.processOutgoingPayment(connection,messageId,message,from,subject,emailDate,parsed,tx)
        : await this.processIncomingPayment(connection,messageId,message,from,subject,emailDate,parsed,tx);
      if (result === 'imported') {
        const imported = await tx.emailImport.findUniqueOrThrow({where:{gmailConnectionId_messageId:{gmailConnectionId:connection.id,messageId}}});
        const entityId = imported.paymentId || imported.expenseId;
        if (entityId) {
          await tx.auditLog.create({data:{orgId:connection.orgId,entityType:imported.paymentId?'PAYMENT':'EXPENSE',entityId,action:'CREATE',source:'gmail_auto_import',diffJson:{after:{amountCents:parsed.amount,paidAt:emailDate.toISOString(),rawPayerName:parsed.payerName,memo:parsed.memo,source:'gmail_auto_import'}},batchId:syncBatch?.batchId,batchDescription:syncBatch?.batchDescription}});
          if (imported.paymentId) await recordPaymentNotice(tx,connection.orgId,entityId,parsed.payerName || 'Someone',parsed.amount!);
        }
      }
      return result;
    },{timeout:15000});
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
    tx: Prisma.TransactionClient,
  ): Promise<'imported' | 'skipped'> {
    if (!parsed.amount) {
      return 'skipped';
    }

    const matchResult = await new ExpenseMatcherService(tx as PrismaService).matchExpense(
      connection.orgId,
      parsed.amount,
      emailDate,
      parsed.payerName,
      parsed.memo,
    );

    if (matchResult.isDuplicate) {
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
          parsedDirection: 'outgoing',
          parsedAmount: parsed.amount,
          parsedPayerName: parsed.payerName,
          parsedPayerEmail: parsed.payerEmail,
          parsedMemo: parsed.memo,
          status: 'DUPLICATE',
          matchedExpenseId: matchResult.matchedExpenseId,
          matchConfidence: matchResult.confidence,
        },
      });

      this.logger.log(
        `Outgoing payment of ${parsed.amount} cents skipped - duplicate expense detected`,
      );

      return 'skipped';
    }

    const adminMembership = await tx.membership.findFirst({
      where: {
        orgId: connection.orgId,
        role: { in: ['ADMIN', 'TREASURER'] },
        status: 'ACTIVE',
      },
    });

    const expense = await tx.expense.create({
      data: {
        orgId: connection.orgId,
        category: 'OTHER',
        title: parsed.memo || `${formatSourceName(parsed.source)} payment to ${parsed.payerName || 'Unknown'}`,
        description: parsed.memo || undefined,
        amountCents: parsed.amount,
        date: emailDate,
        vendor: parsed.payerName || formatSourceName(parsed.source),
        createdById: adminMembership?.id ?? null,
      },
    });

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
    tx: Prisma.TransactionClient,
  ): Promise<'imported' | 'skipped'> {
    if (!parsed.amount) {
      return 'skipped';
    }

    const matchResult = await new PaymentMatcherService(tx as PrismaService).matchPayment(
      connection.orgId,
      parsed.payerName,
      parsed.payerEmail,
      parsed.memo,
      parsed.amount,
    );

    const externalId = `gmail:${connection.id}:${messageId}`;

    const existingPayment = await tx.payment.findFirst({
      where: { orgId: connection.orgId, externalId },
    });

    if (existingPayment) {
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
          matchedMembershipId: matchResult.membershipId,
          matchConfidence: matchResult.confidence,
          paymentId: existingPayment.id,
        },
      });
      return 'imported';
    }

    // Always create payment — membershipId is nullable for unmatched payments
    await (async () => {
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

      // Auto-allocate to matching charges when confidence is high enough
      const txAllocatedChargeIds: string[] = [];
      if (matchResult.membershipId && !await tx.membership.findFirst({where:{id:matchResult.membershipId,orgId:connection.orgId,status:'ACTIVE'}})) throw new Error('Invalid matched member');
      if (matchResult.shouldAutoAllocate && matchResult.suggestedChargeIds.length > 0) {
        let remainingAmount = parsed.amount!;

        for (const chargeId of [...matchResult.suggestedChargeIds].sort()) {
          if (remainingAmount <= 0) break;

          await tx.$queryRaw`SELECT 1 FROM charges WHERE id = ${chargeId} FOR UPDATE`;

          const charge = await tx.charge.findUnique({
            where: { id: chargeId },
            include: { allocations: { select: { amountCents: true } } },
          });

          if (!charge || charge.orgId !== connection.orgId || charge.membershipId !== matchResult.membershipId) continue;

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

          await this.chargesService.updateChargeStatus(chargeId, undefined, tx);

          txAllocatedChargeIds.push(chargeId);
          remainingAmount -= allocationAmount;
        }
      }

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
    })();

    this.logger.log(
      `Auto-created payment of ${parsed.amount} cents from ${parsed.payerName} (confidence: ${matchResult.confidence})`,
    );

    return 'imported';
  }

  private extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
    if (!payload) return '';

    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        const body = this.extractBody(part);
        if (body) return body;
      }
    }

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

      if (membership.name?.toLowerCase() === lower) return;
      if (membership.user?.name?.toLowerCase() === lower) return;
      if (membership.paymentAliases.some(a => a.toLowerCase() === lower)) return;
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

  async getAllImports(orgId: string, limit = 100) {
    return this.prisma.emailImport.findMany({
      where: { orgId },
      orderBy: { emailDate: 'desc' },
      take: limit,
    });
  }

  async getRecentConfirmed(orgId: string, limit = 50) {
    return this.prisma.emailImport.findMany({
      where: {
        orgId,
        status: 'AUTO_CONFIRMED',
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

  async getImportStats(orgId: string) {
    const [autoConfirmed, ignored] = await Promise.all([
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
          status: 'IGNORED',
          reviewedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return { autoConfirmed, ignored };
  }

  async ignoreImport(importId: string) {
    const emailImport = await this.prisma.emailImport.findUnique({
      where: { id: importId },
    });

    if (!emailImport) {
      throw new NotFoundException('Import not found');
    }

    await this.prisma.$transaction(async (tx) => {
      if (emailImport.paymentId) {
        await tx.payment.update({
          where: { id: emailImport.paymentId },
          data: { deletedAt: new Date() },
        }).catch(() => { /* ignore if already deleted */ });
      }

      if (emailImport.expenseId) {
        await tx.expense.update({
          where: { id: emailImport.expenseId },
          data: { deletedAt: new Date() },
        }).catch(() => { /* ignore if already deleted */ });
      }

      await tx.emailImport.update({
        where: { id: importId },
        data: {
          status: 'IGNORED',
          reviewedAt: new Date(),
        },
      });
    });
  }

  async restoreImport(importId: string) {
    const emailImport = await this.prisma.emailImport.findUnique({
      where: { id: importId },
    });

    if (!emailImport) {
      throw new NotFoundException('Import not found');
    }

    await this.prisma.$transaction(async (tx) => {
      if (emailImport.paymentId) {
        await tx.payment.update({
          where: { id: emailImport.paymentId },
          data: { deletedAt: null },
        }).catch(() => { /* ignore if already deleted */ });
      }

      if (emailImport.expenseId) {
        await tx.expense.update({
          where: { id: emailImport.expenseId },
          data: { deletedAt: null },
        }).catch(() => { /* ignore if already deleted */ });
      }

      await tx.emailImport.update({
        where: { id: importId },
        data: {
          status: 'AUTO_CONFIRMED',
          reviewedAt: null,
        },
      });
    });
  }

  private async notifyBrokenConnection(orgId: string, connectionEmail: string) {
    const [admins, org] = await Promise.all([
      this.prisma.membership.findMany({
        where: { orgId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN', 'TREASURER'] }, userId: { not: null } },
        include: { user: { select: { email: true } } },
      }),
      this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true },
      }),
    ]);

    const orgName = org?.name || 'your organization';
    const webUrl = this.configService.get<string>('WEB_URL', 'https://app.ledgly.app');

    for (const admin of admins) {
      if (!admin.user?.email) continue;
      await this.emailService.sendIntegrationAlert(
        admin.user.email,
        orgName,
        'Gmail Sync',
        `The connection for ${connectionEmail} has expired. Please reconnect in Settings to resume auto-importing payments.`,
        `${webUrl}/settings`,
      ).catch(() => {});
    }

    this.logger.warn(`Gmail connection ${connectionEmail} expired for org ${orgName}. Admins notified.`);
  }
}
