import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { MembersService } from '../members/members.service';
import { ChargesService } from '../charges/charges.service';
import { PaymentsService } from '../payments/payments.service';
import { ExpensesService } from '../expenses/expenses.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { toolDefinitions, toolMap } from './agent-tools';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ProposedAction {
  id: string;
  toolName: string;
  args: Record<string, any>;
  description: string;
}

interface SSEEvent {
  type: 'text' | 'tool_calls' | 'done' | 'error';
  content?: string;
  actions?: ProposedAction[];
  message?: string;
}

@Injectable()
export class AgentService {
  private anthropic: Anthropic;
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private membersService: MembersService,
    private chargesService: ChargesService,
    private paymentsService: PaymentsService,
    private expensesService: ExpensesService,
    private auditService: AuditService,
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY is not set — agent chat will fail');
    }
    this.anthropic = new Anthropic({ apiKey: apiKey || 'missing' });
  }

  async querySpreadsheet(
    orgId: string,
    query: string,
    viewMetadata?: { typeFilter: string; rowCount: number; columns: string[] },
  ): Promise<any> {
    const systemPrompt = `You are a spreadsheet query parser. The user is viewing a financial spreadsheet with ${viewMetadata?.rowCount || 0} rows.
Current filter: ${viewMetadata?.typeFilter || 'all'}.
Available columns: ${viewMetadata?.columns?.join(', ') || 'date, type, category, description, member, income, outstanding, expense'}.

Parse the user's natural language query and return JSON with one of these structures:

1. Filter: {"type":"filter","typeFilter":"charge"|"expense"|"payment"|"all","search":"text","categories":["DUES"],"statuses":["OPEN"],"amountMin":0,"amountMax":10000,"dateFrom":"2026-01-01","dateTo":"2026-12-31"}
2. Sort: {"type":"sort","sortBy":"date"|"amount"|"member"|"category"|"outstanding","sortOrder":"asc"|"desc"}
3. Compute: {"type":"compute","expression":"sum","field":"outstandingCents","explanation":"Total outstanding across all charges","filters":{"type":"charge","status":"OPEN"}}

For compute, return an expression the frontend can evaluate against the loaded rows:
- expression: "sum"|"count"|"avg"|"min"|"max"
- field: "incomeCents"|"outstandingCents"|"expenseCents" (the numeric field to aggregate)
- filters: optional row filters to apply before aggregating — {"type":"charge"|"expense"|"payment","status":"OPEN"|"PAID"|"VOID","category":"DUES"}
- explanation: human-readable description of what's being computed

Only include fields that are relevant. For filters, omit fields that aren't constrained.
Category enums for charges: DUES, EVENT, FINE, MERCH, OTHER. For expenses: EVENT, SUPPLIES, FOOD, VENUE, MARKETING, SERVICES, OTHER.
Status enums: OPEN, PARTIALLY_PAID, PAID, VOID.
Return ONLY the JSON object, no markdown or explanation.`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: query }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      return JSON.parse(text);
    } catch (err: any) {
      this.logger.error(`Query parse error: ${err.message}`);
      return { type: 'filter', search: query };
    }
  }

  async *chat(
    orgId: string,
    actorId: string,
    messages: ChatMessage[],
    csvContent?: string,
    spreadsheetContext?: { selectedRows: Array<Record<string, any>> },
  ): AsyncGenerator<SSEEvent> {
    try {
      const systemPrompt = await this.buildSystemPrompt(orgId, csvContent, spreadsheetContext);

      const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Inner loop: keep calling Claude until we get a final text response or write tool calls
      // Cap iterations to prevent runaway API costs
      const MAX_TOOL_ROUNDS = 10;
      let toolRounds = 0;
      let continueLoop = true;
      while (continueLoop) {
        if (++toolRounds > MAX_TOOL_ROUNDS) {
          yield { type: 'text', content: '\n\nI\'ve reached the maximum number of lookups for this request. Please try a more specific question.' };
          break;
        }
        const stream = this.anthropic.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemPrompt,
          messages: anthropicMessages,
          tools: toolDefinitions,
        });

        let currentText = '';
        const toolUseBlocks: Array<{ id: string; name: string; input: any }> = [];

        // Stream text chunks as they arrive
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            currentText += event.delta.text;
            yield { type: 'text', content: event.delta.text };
          }

          if (
            event.type === 'content_block_start' &&
            event.content_block.type === 'tool_use'
          ) {
            toolUseBlocks.push({
              id: event.content_block.id,
              name: event.content_block.name,
              input: {},
            });
          }

          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'input_json_delta'
          ) {
            // Accumulate JSON input for the current tool use block
            const lastBlock = toolUseBlocks[toolUseBlocks.length - 1];
            if (lastBlock) {
              lastBlock.input = undefined; // Will be resolved from final message
            }
          }
        }

        // Get the final message to extract complete tool inputs
        const finalMessage = await stream.finalMessage();

        // Extract complete tool use blocks from the final message
        const completeToolBlocks = finalMessage.content.filter(
          (b): b is Anthropic.ContentBlock & { type: 'tool_use' } =>
            b.type === 'tool_use',
        );

        if (completeToolBlocks.length === 0) {
          // No tool calls — we're done
          continueLoop = false;
          break;
        }

        // Separate read tools from write tools
        const readTools = completeToolBlocks.filter((b) => {
          const tool = toolMap.get(b.name);
          return tool && !tool.requiresConfirmation;
        });
        const writeTools = completeToolBlocks.filter((b) => {
          const tool = toolMap.get(b.name);
          return tool && tool.requiresConfirmation;
        });

        if (writeTools.length > 0) {
          // Return proposed actions to frontend for confirmation
          const actions: ProposedAction[] = await Promise.all(
            writeTools.map(async (b) => ({
              id: b.id,
              toolName: b.name,
              args: b.input as Record<string, any>,
              description: await this.describeAction(orgId, b.name, b.input as Record<string, any>),
            })),
          );
          yield { type: 'tool_calls', actions };
          continueLoop = false;
          break;
        }

        if (readTools.length > 0) {
          // Emit a separator so the next round's text doesn't merge with the previous
          if (currentText.length > 0) {
            yield { type: 'text', content: '\n\n' };
          }

          // Execute read tools and feed results back to Claude
          // Add assistant message with tool use to conversation
          anthropicMessages.push({
            role: 'assistant',
            content: finalMessage.content,
          });

          // Execute each read tool and create tool_result messages
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of readTools) {
            try {
              const result = await this.executeReadTool(orgId, block.name, block.input as Record<string, any>);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(result),
              });
            } catch (err: any) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: `Error: ${err.message}`,
                is_error: true,
              });
            }
          }

          anthropicMessages.push({
            role: 'user',
            content: toolResults,
          });
          // Continue the loop — Claude will process the tool results
        }
      }

      yield { type: 'done' };
    } catch (err: any) {
      this.logger.error(`Agent chat error: ${err.message}`, err.stack);
      yield { type: 'error', message: err.message || 'An unexpected error occurred' };
    }
  }

  async confirm(
    orgId: string,
    actorId: string,
    actions: Array<{ toolName: string; args: Record<string, any> }>,
  ): Promise<Array<{ toolName: string; success: boolean; message: string; details?: any }>> {
    const results: Array<{ toolName: string; success: boolean; message: string; details?: any; skipped?: Array<{ id: string; reason: string }> }> = [];

    // Wrap all agent actions so every audit entry gets source: 'LEDGLY_AI'
    await this.auditService.runWithSource('LEDGLY_AI', async () => {
      for (const action of actions) {
        try {
          const result = await this.executeWriteTool(orgId, actorId, action.toolName, action.args);
          let message = await this.describeAction(orgId, action.toolName, action.args);

          // Surface partial failures (e.g. bulkRemove skipped items)
          const skipped = result?.skipped;
          if (Array.isArray(skipped) && skipped.length > 0) {
            message += ` (${skipped.length} skipped: ${skipped.map((s: any) => s.reason).join(', ')})`;
          }

          results.push({
            toolName: action.toolName,
            success: true,
            message,
            details: result,
            skipped,
          });
        } catch (err: any) {
          results.push({
            toolName: action.toolName,
            success: false,
            message: `Failed: ${err.message}`,
          });
        }
      }
    });

    return results;
  }

  private async executeReadTool(orgId: string, toolName: string, args: Record<string, any>): Promise<any> {
    switch (toolName) {
      case 'list_members': {
        const result = await this.membersService.findAll(orgId, {
          search: args.search,
          status: args.status,
          limit: 200,
        });
        const mapped = result.data.map((m: any) => ({
          id: m.id,
          name: m.name || m.user?.name,
          email: m.user?.email,
          role: m.role,
          status: m.status,
          balanceCents: m.balanceCents,
        }));
        if (mapped.length === 0 && args.search) {
          const all = await this.membersService.findAll(orgId, { status: args.status, limit: 200 });
          return {
            _hint: `No exact match for "${args.search}". Showing all results — pick the closest match (nicknames, partial names, and abbreviations count as matches). Only say nothing was found if no result is remotely similar.`,
            data: all.data.map((m: any) => ({
              id: m.id, name: m.name || m.user?.name, email: m.user?.email,
              role: m.role, status: m.status, balanceCents: m.balanceCents,
            })),
          };
        }
        return mapped;
      }

      case 'list_charges': {
        const result = await this.chargesService.findAll(orgId, {
          status: args.status,
          category: args.category,
          membershipId: args.membershipId,
          search: args.search,
          limit: 200,
        });
        const mapped = result.data.map((c: any) => ({
          id: c.id,
          title: c.title,
          amountCents: c.amountCents,
          status: c.status,
          category: c.category,
          memberName: c.membership?.name || c.membership?.user?.name,
          membershipId: c.membershipId,
          dueDate: c.dueDate,
        }));
        if (mapped.length === 0 && args.search) {
          const all = await this.chargesService.findAll(orgId, {
            status: args.status, category: args.category,
            membershipId: args.membershipId, limit: 200,
          });
          return {
            _hint: `No exact match for "${args.search}". Showing all results — pick the closest match (nicknames, partial names, and abbreviations count as matches). Only say nothing was found if no result is remotely similar.`,
            data: all.data.map((c: any) => ({
              id: c.id, title: c.title, amountCents: c.amountCents, status: c.status,
              category: c.category, memberName: c.membership?.name || c.membership?.user?.name,
              membershipId: c.membershipId, dueDate: c.dueDate,
            })),
          };
        }
        return mapped;
      }

      case 'list_payments': {
        const filters: any = {};
        if (args.membershipId) filters.membershipId = args.membershipId;
        if (args.unallocated) filters.unallocated = true;
        if (args.search) filters.search = args.search;
        const result = await this.paymentsService.findAll(orgId, { ...filters, limit: 200 });
        const mapped = result.data.map((p: any) => ({
          id: p.id,
          amountCents: p.amountCents,
          paidAt: p.paidAt,
          rawPayerName: p.rawPayerName,
          memo: p.memo,
          memberName: p.membership?.name || p.membership?.user?.name,
          allocatedCents: p.allocatedCents,
        }));
        if (mapped.length === 0 && args.search) {
          const fallbackFilters: any = {};
          if (args.membershipId) fallbackFilters.membershipId = args.membershipId;
          if (args.unallocated) fallbackFilters.unallocated = true;
          const all = await this.paymentsService.findAll(orgId, { ...fallbackFilters, limit: 200 });
          return {
            _hint: `No exact match for "${args.search}". Showing all results — pick the closest match (nicknames, partial names, and abbreviations count as matches). Only say nothing was found if no result is remotely similar.`,
            data: all.data.map((p: any) => ({
              id: p.id, amountCents: p.amountCents, paidAt: p.paidAt,
              rawPayerName: p.rawPayerName, memo: p.memo,
              memberName: p.membership?.name || p.membership?.user?.name,
              allocatedCents: p.allocatedCents,
            })),
          };
        }
        return mapped;
      }

      case 'list_expenses': {
        const result = await this.expensesService.findAll(orgId, {
          category: args.category,
          search: args.search,
          limit: 200,
        });
        const mapExpense = (e: any) => ({
          id: e.id,
          title: e.title,
          description: e.description,
          amountCents: e.amountCents,
          category: e.category,
          date: e.date,
          vendor: e.vendor,
        });
        const mapped = result.data.map(mapExpense);
        if (mapped.length === 0 && args.search) {
          const all = await this.expensesService.findAll(orgId, {
            category: args.category, limit: 200,
          });
          return {
            _hint: `No exact match for "${args.search}". Showing all results — pick the closest match (nicknames, partial names, and abbreviations count as matches). Only say nothing was found if no result is remotely similar.`,
            data: all.data.map(mapExpense),
          };
        }
        return mapped;
      }

      case 'get_dashboard_stats': {
        const [chargeTotal, paidTotal, collected, overdue, memberCount, openChargeCount] = await Promise.all([
          this.prisma.charge.aggregate({
            where: { orgId, status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
            _sum: { amountCents: true },
          }),
          this.prisma.paymentAllocation.aggregate({
            where: { charge: { orgId, status: { in: ['OPEN', 'PARTIALLY_PAID'] } } },
            _sum: { amountCents: true },
          }),
          this.prisma.payment.aggregate({
            where: { orgId, deletedAt: null },
            _sum: { amountCents: true },
          }),
          this.prisma.charge.count({
            where: { orgId, status: { in: ['OPEN', 'PARTIALLY_PAID'] }, dueDate: { lt: new Date() } },
          }),
          this.prisma.membership.count({ where: { orgId, status: 'ACTIVE' } }),
          this.prisma.charge.count({ where: { orgId, status: { in: ['OPEN', 'PARTIALLY_PAID'] } } }),
        ]);
        const outstandingCents = (chargeTotal._sum.amountCents || 0) - (paidTotal._sum.amountCents || 0);
        return {
          outstandingCents,
          collectedCents: collected._sum.amountCents || 0,
          overdueCharges: overdue,
          activeMembers: memberCount,
          openCharges: openChargeCount,
        };
      }

      case 'get_expense_summary': {
        return this.expensesService.getSummary(orgId, args.startDate, args.endDate);
      }

      case 'query_activity': {
        const result = await this.auditService.findByOrg(orgId, {
          entityType: args.entityType,
          limit: args.limit || 20,
        });
        return result.data.map((log: any) => ({
          action: log.action,
          entityType: log.entityType,
          description: log.description,
          actorName: log.actor?.name || log.actor?.user?.name || 'System',
          createdAt: log.createdAt,
        }));
      }

      case 'get_balances': {
        const members = await this.membersService.findAll(orgId, { status: 'ACTIVE', limit: 500 });
        return members.data
          .filter((m: any) => m.balanceCents !== 0)
          .map((m: any) => ({
            id: m.id,
            name: m.name || m.user?.name,
            balanceCents: m.balanceCents,
            totalChargedCents: m.totalChargedCents,
            totalPaidCents: m.totalPaidCents,
          }));
      }

      case 'get_insights': {
        return this.getInsightsForAgent(orgId);
      }

      case 'generate_report': {
        return this.generateReportForAgent(orgId, args);
      }

      default:
        throw new Error(`Unknown read tool: ${toolName}`);
    }
  }

  private async getInsightsForAgent(orgId: string) {
    const now = new Date();
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const insights: Array<{ type: string; severity: string; title: string; detail: string }> = [];

    // Delinquent members
    const delinquent = await this.prisma.$queryRaw<Array<{ member_name: string }>>`
      SELECT COALESCE(m.name, u.name, u.email, 'Unknown') as member_name
      FROM memberships m LEFT JOIN users u ON m.user_id = u.id
      WHERE m.org_id = ${orgId} AND m.status = 'ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.membership_id = m.id AND p.deleted_at IS NULL AND p.paid_at >= ${sixtyDaysAgo})
      AND EXISTS (SELECT 1 FROM charges c WHERE c.membership_id = m.id AND c.status IN ('OPEN', 'PARTIALLY_PAID'))
    `;
    if (delinquent.length > 0) {
      insights.push({
        type: 'delinquent_members', severity: 'warning',
        title: `${delinquent.length} member(s) with no payment in 60+ days`,
        detail: delinquent.slice(0, 5).map(m => m.member_name).join(', '),
      });
    }

    // Overdue charges
    const overdueCount = await this.prisma.charge.count({
      where: { orgId, status: { in: ['OPEN', 'PARTIALLY_PAID'] }, dueDate: { lt: thirtyDaysAgo } },
    });
    if (overdueCount > 0) {
      insights.push({
        type: 'overdue_charges', severity: 'warning',
        title: `${overdueCount} charge(s) overdue by 30+ days`,
        detail: 'Consider sending reminders.',
      });
    }

    return insights;
  }

  private async generateReportForAgent(orgId: string, args: Record<string, any>) {
    const now = new Date();
    let startDate: string;
    let endDate: string;

    switch (args.period) {
      case 'THIS_MONTH':
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        endDate = now.toISOString().split('T')[0];
        break;
      case 'LAST_MONTH': {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
        startDate = lastMonth.toISOString().split('T')[0];
        endDate = lastDay.toISOString().split('T')[0];
        break;
      }
      case 'THIS_QUARTER': {
        const qMonth = Math.floor(now.getMonth() / 3) * 3;
        startDate = `${now.getFullYear()}-${String(qMonth + 1).padStart(2, '0')}-01`;
        endDate = now.toISOString().split('T')[0];
        break;
      }
      case 'THIS_YEAR':
        startDate = `${now.getFullYear()}-01-01`;
        endDate = now.toISOString().split('T')[0];
        break;
      case 'CUSTOM':
        startDate = args.startDate || `${now.getFullYear()}-01-01`;
        endDate = args.endDate || now.toISOString().split('T')[0];
        break;
      default:
        startDate = `${now.getFullYear()}-01-01`;
        endDate = now.toISOString().split('T')[0];
    }

    // Collection summary
    const charges = await this.prisma.charge.findMany({
      where: {
        orgId, status: { not: 'VOID' },
        createdAt: { gte: new Date(startDate + 'T00:00:00'), lte: new Date(endDate + 'T23:59:59') },
      },
      include: { allocations: { select: { amountCents: true } } },
    });

    const totalCharged = charges.reduce((s, c) => s + c.amountCents, 0);
    const totalCollected = charges.reduce((s, c) => s + c.allocations.reduce((a, al) => a + al.amountCents, 0), 0);

    // Outstanding by member
    const members = await this.prisma.membership.findMany({
      where: { orgId, status: 'ACTIVE' },
      include: {
        user: { select: { name: true, email: true } },
        chargesAssigned: {
          where: { status: { not: 'VOID' } },
          include: { allocations: { select: { amountCents: true } } },
        },
      },
    });

    const outstanding = members.map(m => {
      const charged = m.chargesAssigned.reduce((s, c) => s + c.amountCents, 0);
      const paid = m.chargesAssigned.reduce((s, c) => s + c.allocations.reduce((a, al) => a + al.amountCents, 0), 0);
      return { name: m.name || m.user?.name || m.user?.email || 'Unknown', chargedCents: charged, paidCents: paid, balanceCents: charged - paid };
    }).filter(m => m.balanceCents > 0).sort((a, b) => b.balanceCents - a.balanceCents);

    return {
      period: { start: startDate, end: endDate },
      collectionSummary: {
        totalChargedCents: totalCharged,
        totalCollectedCents: totalCollected,
        outstandingCents: totalCharged - totalCollected,
        collectionRate: totalCharged > 0 ? Math.round((totalCollected / totalCharged) * 100) : 0,
        chargesCount: charges.length,
      },
      outstandingByMember: outstanding.slice(0, 20),
    };
  }

  private async executeWriteTool(
    orgId: string,
    actorId: string,
    toolName: string,
    args: Record<string, any>,
  ): Promise<any> {
    // ── Input validation ────────────────────────────────────────
    this.validateWriteArgs(toolName, args);

    switch (toolName) {
      case 'add_members':
        return this.membersService.createMany(orgId, args.members, actorId);

      case 'update_member':
        return this.membersService.update(orgId, args.membershipId, {
          ...(args.name && { name: args.name }),
          ...(args.role && { role: args.role }),
          ...(args.status && { status: args.status }),
        }, actorId);

      case 'update_charge':
        return this.chargesService.update(orgId, args.chargeId, {
          ...(args.title && { title: args.title }),
          ...(args.amountCents && { amountCents: args.amountCents }),
          ...(args.dueDate !== undefined && { dueDate: args.dueDate }),
        }, actorId);

      case 'update_expense':
        return this.expensesService.update(orgId, args.expenseId, {
          ...(args.title && { title: args.title }),
          ...(args.amountCents && { amountCents: args.amountCents }),
          ...(args.category && { category: args.category.toUpperCase() }),
          ...(args.date && { date: args.date }),
          ...(args.vendor !== undefined && { vendor: args.vendor }),
        }, actorId);

      case 'create_charges':
        return this.chargesService.create(orgId, actorId, {
          membershipIds: args.membershipIds,
          category: args.category,
          title: args.title,
          amountCents: args.amountCents,
          dueDate: args.dueDate || null,
        });

      case 'create_expense':
        return this.expensesService.create(orgId, actorId, {
          category: args.category?.toUpperCase(),
          title: args.title,
          amountCents: args.amountCents,
          date: args.date,
          vendor: args.vendor,
        });

      case 'create_multi_charge':
        return this.chargesService.createMultiCharge(orgId, actorId, {
          membershipIds: args.membershipIds,
          category: args.category,
          title: args.title,
          amountCents: args.amountCents,
          dueDate: args.dueDate || null,
        });

      case 'create_multi_expense':
        return this.expensesService.createMultiExpense(orgId, actorId, {
          category: args.category?.toUpperCase(),
          title: args.title,
          date: args.date,
          vendor: args.vendor,
          children: args.children,
        });

      case 'record_payments':
        return this.paymentsService.bulkCreate(orgId, actorId, args.payments);

      case 'void_charges':
        return this.chargesService.bulkVoid(orgId, args.chargeIds, actorId);

      case 'remove_members':
        return this.membersService.bulkRemove(orgId, args.memberIds, actorId);

      case 'delete_expenses':
        return this.expensesService.bulkDelete(orgId, args.expenseIds, actorId);

      case 'restore_charges': {
        let count = 0;
        for (const id of args.chargeIds) {
          await this.chargesService.restore(orgId, id, actorId);
          count++;
        }
        return { success: true, restoredCount: count };
      }

      case 'restore_expenses': {
        let count = 0;
        for (const id of args.expenseIds) {
          await this.expensesService.restore(orgId, id, actorId);
          count++;
        }
        return { success: true, restoredCount: count };
      }

      case 'restore_members': {
        let count = 0;
        for (const id of args.memberIds) {
          await this.membersService.restore(orgId, id, actorId);
          count++;
        }
        return { success: true, restoredCount: count };
      }

      case 'delete_payments':
        return this.paymentsService.bulkDelete(orgId, args.paymentIds, actorId);

      case 'restore_payments': {
        let count = 0;
        for (const id of args.paymentIds) {
          await this.paymentsService.restore(orgId, id, actorId);
          count++;
        }
        return { success: true, restoredCount: count };
      }

      case 'allocate_payment':
        return this.paymentsService.allocate(orgId, args.paymentId, actorId, {
          allocations: args.allocations,
        });

      case 'auto_allocate_payment':
        return this.paymentsService.autoAllocatePayment(orgId, args.paymentId, actorId);

      case 'import_csv':
        return this.executeImport(orgId, actorId, args.type, args.rows);

      case 'deallocate_payment':
        return this.paymentsService.bulkRemoveAllocations(orgId, args.allocationIds, actorId);

      case 'send_reminders': {
        // If no chargeIds specified, find all unpaid charges
        let chargeIds = args.chargeIds;
        if (!chargeIds || chargeIds.length === 0) {
          const unpaid = await this.prisma.charge.findMany({
            where: { orgId, status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
            select: { id: true },
          });
          chargeIds = unpaid.map((c: any) => c.id);
        }
        if (chargeIds.length === 0) return { sent: 0, skipped: 0 };
        return this.chargesService.sendReminders(orgId, chargeIds);
      }

      default:
        throw new Error(`Unknown write tool: ${toolName}`);
    }
  }

  // ── Constants ────────────────────────────────────────────────
  private static readonly MAX_AMOUNT_CENTS = 100_000_00; // $100,000
  private static readonly MAX_STRING_LENGTH = 500;
  private static readonly MAX_CSV_ROWS = 500;
  private static readonly MAX_BATCH_SIZE = 200;
  private static readonly ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

  private validateWriteArgs(toolName: string, args: Record<string, any>): void {
    switch (toolName) {
      case 'add_members':
        if (!Array.isArray(args.members) || args.members.length === 0)
          throw new Error('members array is required and cannot be empty');
        if (args.members.length > AgentService.MAX_BATCH_SIZE)
          throw new Error(`Cannot add more than ${AgentService.MAX_BATCH_SIZE} members at once`);
        for (const m of args.members) {
          if (!m.name || typeof m.name !== 'string' || !m.name.trim())
            throw new Error('Each member must have a non-empty name');
          this.validateStringLength(m.name, 'member name');
          if (m.email && typeof m.email === 'string') this.validateStringLength(m.email, 'email');
        }
        break;

      case 'update_member':
        if (!args.membershipId || typeof args.membershipId !== 'string')
          throw new Error('membershipId is required');
        if (args.name) this.validateStringLength(args.name, 'name');
        break;

      case 'update_charge':
        if (!args.chargeId || typeof args.chargeId !== 'string')
          throw new Error('chargeId is required');
        if (args.title) this.validateStringLength(args.title, 'title');
        if (args.amountCents !== undefined) this.validateAmount(args.amountCents);
        if (args.dueDate && args.dueDate !== null) this.validateDate(args.dueDate, 'dueDate');
        break;

      case 'update_expense':
        if (!args.expenseId || typeof args.expenseId !== 'string')
          throw new Error('expenseId is required');
        if (args.title) this.validateStringLength(args.title, 'title');
        if (args.amountCents !== undefined) this.validateAmount(args.amountCents);
        if (args.date) this.validateDate(args.date, 'date');
        if (args.vendor) this.validateStringLength(args.vendor, 'vendor');
        if (args.category) this.validateExpenseCategory(args.category);
        break;

      case 'create_charges':
        if (!Array.isArray(args.membershipIds) || args.membershipIds.length === 0)
          throw new Error('membershipIds array is required and cannot be empty');
        if (args.membershipIds.length > AgentService.MAX_BATCH_SIZE)
          throw new Error(`Cannot charge more than ${AgentService.MAX_BATCH_SIZE} members at once`);
        this.validateAmount(args.amountCents);
        this.validateRequiredString(args.title, 'title');
        if (args.dueDate) this.validateDate(args.dueDate, 'dueDate');
        break;

      case 'create_expense':
        this.validateAmount(args.amountCents);
        this.validateRequiredString(args.title, 'title');
        this.validateDate(args.date, 'date');
        if (args.vendor) this.validateStringLength(args.vendor, 'vendor');
        if (args.category) this.validateExpenseCategory(args.category);
        break;

      case 'create_multi_charge':
        if (!Array.isArray(args.membershipIds) || args.membershipIds.length === 0)
          throw new Error('membershipIds array is required and cannot be empty');
        if (args.membershipIds.length > AgentService.MAX_BATCH_SIZE)
          throw new Error(`Cannot charge more than ${AgentService.MAX_BATCH_SIZE} members at once`);
        this.validateAmount(args.amountCents);
        this.validateRequiredString(args.title, 'title');
        if (args.dueDate) this.validateDate(args.dueDate, 'dueDate');
        break;

      case 'create_multi_expense':
        this.validateRequiredString(args.title, 'title');
        this.validateDate(args.date, 'date');
        if (args.vendor) this.validateStringLength(args.vendor, 'vendor');
        if (args.category) this.validateExpenseCategory(args.category);
        if (!Array.isArray(args.children) || args.children.length === 0)
          throw new Error('children array is required and cannot be empty');
        if (args.children.length > AgentService.MAX_BATCH_SIZE)
          throw new Error(`Cannot create more than ${AgentService.MAX_BATCH_SIZE} line items at once`);
        for (const child of args.children) {
          this.validateRequiredString(child.title, 'child title');
          this.validateAmount(child.amountCents);
          if (child.vendor) this.validateStringLength(child.vendor, 'child vendor');
        }
        break;

      case 'record_payments':
        if (!Array.isArray(args.payments) || args.payments.length === 0)
          throw new Error('payments array is required and cannot be empty');
        if (args.payments.length > AgentService.MAX_BATCH_SIZE)
          throw new Error(`Cannot record more than ${AgentService.MAX_BATCH_SIZE} payments at once`);
        for (const p of args.payments) {
          this.validateAmount(p.amountCents);
          this.validateDate(p.paidAt, 'paidAt');
          if (p.rawPayerName) this.validateStringLength(p.rawPayerName, 'rawPayerName');
          if (p.memo) this.validateStringLength(p.memo, 'memo');
        }
        break;

      case 'void_charges':
        if (!Array.isArray(args.chargeIds) || args.chargeIds.length === 0)
          throw new Error('chargeIds array is required and cannot be empty');
        if (args.chargeIds.length > AgentService.MAX_BATCH_SIZE)
          throw new Error(`Cannot void more than ${AgentService.MAX_BATCH_SIZE} charges at once`);
        break;

      case 'remove_members':
        if (!Array.isArray(args.memberIds) || args.memberIds.length === 0)
          throw new Error('memberIds array is required and cannot be empty');
        if (args.memberIds.length > AgentService.MAX_BATCH_SIZE)
          throw new Error(`Cannot remove more than ${AgentService.MAX_BATCH_SIZE} members at once`);
        break;

      case 'delete_expenses':
        if (!Array.isArray(args.expenseIds) || args.expenseIds.length === 0)
          throw new Error('expenseIds array is required and cannot be empty');
        if (args.expenseIds.length > AgentService.MAX_BATCH_SIZE)
          throw new Error(`Cannot delete more than ${AgentService.MAX_BATCH_SIZE} expenses at once`);
        break;

      case 'restore_charges':
        if (!Array.isArray(args.chargeIds) || args.chargeIds.length === 0)
          throw new Error('chargeIds array is required and cannot be empty');
        if (args.chargeIds.length > AgentService.MAX_BATCH_SIZE)
          throw new Error(`Cannot restore more than ${AgentService.MAX_BATCH_SIZE} charges at once`);
        break;

      case 'restore_expenses':
        if (!Array.isArray(args.expenseIds) || args.expenseIds.length === 0)
          throw new Error('expenseIds array is required and cannot be empty');
        if (args.expenseIds.length > AgentService.MAX_BATCH_SIZE)
          throw new Error(`Cannot restore more than ${AgentService.MAX_BATCH_SIZE} expenses at once`);
        break;

      case 'restore_members':
        if (!Array.isArray(args.memberIds) || args.memberIds.length === 0)
          throw new Error('memberIds array is required and cannot be empty');
        if (args.memberIds.length > AgentService.MAX_BATCH_SIZE)
          throw new Error(`Cannot restore more than ${AgentService.MAX_BATCH_SIZE} members at once`);
        break;

      case 'delete_payments':
        if (!Array.isArray(args.paymentIds) || args.paymentIds.length === 0)
          throw new Error('paymentIds array is required and cannot be empty');
        if (args.paymentIds.length > AgentService.MAX_BATCH_SIZE)
          throw new Error(`Cannot delete more than ${AgentService.MAX_BATCH_SIZE} payments at once`);
        break;

      case 'restore_payments':
        if (!Array.isArray(args.paymentIds) || args.paymentIds.length === 0)
          throw new Error('paymentIds array is required and cannot be empty');
        if (args.paymentIds.length > AgentService.MAX_BATCH_SIZE)
          throw new Error(`Cannot restore more than ${AgentService.MAX_BATCH_SIZE} payments at once`);
        break;

      case 'allocate_payment':
        if (!args.paymentId || typeof args.paymentId !== 'string')
          throw new Error('paymentId is required');
        if (!Array.isArray(args.allocations) || args.allocations.length === 0)
          throw new Error('allocations array is required and cannot be empty');
        for (const a of args.allocations) {
          if (!a.chargeId || typeof a.chargeId !== 'string')
            throw new Error('Each allocation must have a chargeId');
          if (typeof a.amountCents !== 'number' || a.amountCents <= 0)
            throw new Error('Each allocation must have a positive amountCents');
        }
        break;

      case 'auto_allocate_payment':
        if (!args.paymentId || typeof args.paymentId !== 'string')
          throw new Error('paymentId is required');
        break;

      case 'import_csv':
        if (!args.type || !['members', 'charges', 'payments', 'expenses'].includes(args.type))
          throw new Error('type must be one of: members, charges, payments, expenses');
        if (!Array.isArray(args.rows) || args.rows.length === 0)
          throw new Error('rows array is required and cannot be empty');
        if (args.rows.length > AgentService.MAX_CSV_ROWS)
          throw new Error(`CSV import limited to ${AgentService.MAX_CSV_ROWS} rows at a time`);
        break;

      case 'deallocate_payment':
        if (!Array.isArray(args.allocationIds) || args.allocationIds.length === 0)
          throw new Error('allocationIds array is required and cannot be empty');
        if (args.allocationIds.length > AgentService.MAX_BATCH_SIZE)
          throw new Error(`Cannot deallocate more than ${AgentService.MAX_BATCH_SIZE} at once`);
        break;

      case 'send_reminders':
        // chargeIds is optional; if provided, validate
        if (args.chargeIds && !Array.isArray(args.chargeIds))
          throw new Error('chargeIds must be an array if provided');
        break;
    }
  }

  private validateAmount(amountCents: any): void {
    if (typeof amountCents !== 'number' || !Number.isFinite(amountCents))
      throw new Error('amountCents must be a finite number');
    if (amountCents <= 0)
      throw new Error('amountCents must be a positive number');
    if (!Number.isInteger(amountCents))
      throw new Error('amountCents must be a whole number (no fractional cents)');
    if (amountCents > AgentService.MAX_AMOUNT_CENTS)
      throw new Error(`amountCents cannot exceed ${AgentService.MAX_AMOUNT_CENTS} ($${(AgentService.MAX_AMOUNT_CENTS / 100).toLocaleString()})`);
  }

  private validateRequiredString(value: any, fieldName: string): void {
    if (!value || typeof value !== 'string' || !value.trim())
      throw new Error(`${fieldName} is required`);
    this.validateStringLength(value, fieldName);
  }

  private static readonly VALID_EXPENSE_CATEGORIES = ['EVENT', 'SUPPLIES', 'FOOD', 'VENUE', 'MARKETING', 'SERVICES', 'OTHER'];

  private validateStringLength(value: string, fieldName: string): void {
    if (value.length > AgentService.MAX_STRING_LENGTH)
      throw new Error(`${fieldName} cannot exceed ${AgentService.MAX_STRING_LENGTH} characters`);
  }

  private validateExpenseCategory(value: string): void {
    const upper = value?.toUpperCase();
    if (!AgentService.VALID_EXPENSE_CATEGORIES.includes(upper))
      throw new Error(`Invalid expense category "${value}". Must be one of: ${AgentService.VALID_EXPENSE_CATEGORIES.join(', ')}`);
  }

  private validateDate(value: any, fieldName: string): void {
    if (!value) throw new Error(`${fieldName} is required`);
    if (typeof value !== 'string' || !AgentService.ISO_DATE_RE.test(value))
      throw new Error(`${fieldName} must be a valid date in ISO format (YYYY-MM-DD)`);
    const parsed = new Date(value);
    if (isNaN(parsed.getTime()))
      throw new Error(`${fieldName} is not a valid date`);
  }

  private async executeImport(orgId: string, actorId: string, type: string, rows: any[]): Promise<any> {
    switch (type) {
      case 'members':
        return this.membersService.createMany(orgId, rows, actorId);
      case 'payments':
        return this.paymentsService.bulkCreate(orgId, actorId, rows);
      case 'expenses': {
        const results: any[] = [];
        for (const row of rows) {
          results.push(await this.expensesService.create(orgId, actorId, row));
        }
        return results;
      }
      case 'charges': {
        // For charge imports, each row needs membershipId(s)
        const results: any[] = [];
        for (const row of rows) {
          const membershipIds = Array.isArray(row.membershipIds)
            ? row.membershipIds
            : [row.membershipId];
          results.push(
            await this.chargesService.create(orgId, actorId, {
              membershipIds,
              category: row.category || 'OTHER',
              title: row.title,
              amountCents: row.amountCents,
              dueDate: row.dueDate || null,
            }),
          );
        }
        return results.flat();
      }
      default:
        throw new Error(`Unsupported import type: ${type}`);
    }
  }

  private async describeAction(orgId: string, toolName: string, args: Record<string, any>): Promise<string> {
    switch (toolName) {
      case 'update_member': {
        const member = await this.prisma.membership.findFirst({
          where: { id: args.membershipId, orgId },
          select: { name: true, role: true, status: true, user: { select: { name: true } } },
        });
        const name = member?.name || member?.user?.name || 'Unknown';
        args._old = { name, role: member?.role, status: member?.status };
        return `Update member "${name}"`;
      }
      case 'update_charge': {
        const charge = await this.prisma.charge.findFirst({
          where: { id: args.chargeId, orgId },
          select: { title: true, amountCents: true, dueDate: true },
        });
        args._old = { title: charge?.title, amountCents: charge?.amountCents, dueDate: charge?.dueDate };
        return `Update charge "${charge?.title || 'Unknown'}"`;
      }
      case 'update_expense': {
        const expense = await this.prisma.expense.findFirst({
          where: { id: args.expenseId, orgId },
          select: { title: true, amountCents: true, category: true, vendor: true, date: true },
        });
        args._old = { title: expense?.title, amountCents: expense?.amountCents, category: expense?.category, vendor: expense?.vendor, date: expense?.date };
        return `Update expense "${expense?.title || expense?.vendor || 'Unknown'}"`;
      }
      case 'add_members':
        return `Add ${args.members?.length || 0} member(s): ${(args.members || []).slice(0, 3).map((m: any) => m.name).join(', ')}${(args.members?.length || 0) > 3 ? '...' : ''}`;
      case 'create_charges': {
        const chargeMembers = await this.prisma.membership.findMany({
          where: { id: { in: args.membershipIds || [] }, orgId },
          select: { id: true, name: true, user: { select: { name: true } } },
        });
        args._memberNames = Object.fromEntries(chargeMembers.map((m) => [m.id, m.name || m.user?.name || 'Unknown']));
        return `Charge "${args.title}" ($${((args.amountCents || 0) / 100).toFixed(2)}) to ${chargeMembers.length} member(s)`;
      }
      case 'create_expense':
        return `Record expense "${args.title}" ($${((args.amountCents || 0) / 100).toFixed(2)})`;
      case 'create_multi_charge': {
        const multiChargeMembers = await this.prisma.membership.findMany({
          where: { id: { in: args.membershipIds || [] }, orgId },
          select: { id: true, name: true, user: { select: { name: true } } },
        });
        args._memberNames = Object.fromEntries(multiChargeMembers.map((m) => [m.id, m.name || m.user?.name || 'Unknown']));
        return `Charge "${args.title}" ($${((args.amountCents || 0) / 100).toFixed(2)}/each) to ${multiChargeMembers.length} member(s)`;
      }
      case 'create_multi_expense':
        return `Record "${args.title}" with ${args.children?.length || 0} line item(s)`;
      case 'record_payments':
        return `Record ${args.payments?.length || 0} payment(s)`;
      case 'void_charges': {
        const charges = await this.prisma.charge.findMany({
          where: { id: { in: args.chargeIds || [] }, orgId },
          select: { title: true, amountCents: true, dueDate: true, membership: { select: { name: true, user: { select: { name: true } } } } },
        });
        args._items = charges.map((c) => ({
          title: c.title,
          amountCents: c.amountCents,
          dueDate: c.dueDate,
          memberName: c.membership?.name || c.membership?.user?.name,
        }));
        return `Void ${charges.length} charge(s)`;
      }
      case 'remove_members': {
        const members = await this.prisma.membership.findMany({
          where: { id: { in: args.memberIds || [] }, orgId },
          select: { name: true, role: true, user: { select: { name: true, email: true } } },
        });
        args._items = members.map((m) => ({
          name: m.name || m.user?.name || 'Unknown',
          email: m.user?.email,
          role: m.role,
        }));
        return `Remove ${members.length} member(s)`;
      }
      case 'delete_expenses': {
        const expenses = await this.prisma.expense.findMany({
          where: { id: { in: args.expenseIds || [] }, orgId },
          select: { title: true, description: true, amountCents: true, vendor: true, date: true, category: true },
        });
        args._items = expenses.map((e) => ({
          title: e.title,
          description: e.description,
          amountCents: e.amountCents,
          vendor: e.vendor !== e.title ? e.vendor : null,
          date: e.date,
          category: e.category,
        }));
        return `Delete ${expenses.length} expense(s)`;
      }
      case 'restore_charges': {
        const charges = await this.prisma.charge.findMany({
          where: { id: { in: args.chargeIds || [] }, orgId },
          select: { title: true, amountCents: true, dueDate: true, membership: { select: { name: true, user: { select: { name: true } } } } },
        });
        args._items = charges.map((c) => ({
          title: c.title,
          amountCents: c.amountCents,
          dueDate: c.dueDate,
          memberName: c.membership?.name || c.membership?.user?.name,
        }));
        return `Restore ${charges.length} charge(s)`;
      }
      case 'restore_expenses': {
        const expenses = await this.prisma.expense.findMany({
          where: { id: { in: args.expenseIds || [] }, orgId },
          select: { title: true, amountCents: true, vendor: true, date: true, category: true },
        });
        args._items = expenses.map((e) => ({
          title: e.title,
          amountCents: e.amountCents,
          vendor: e.vendor !== e.title ? e.vendor : null,
          date: e.date,
          category: e.category,
        }));
        return `Restore ${expenses.length} expense(s)`;
      }
      case 'restore_members': {
        const members = await this.prisma.membership.findMany({
          where: { id: { in: args.memberIds || [] }, orgId },
          select: { name: true, role: true, user: { select: { name: true, email: true } } },
        });
        args._items = members.map((m) => ({
          name: m.name || m.user?.name || 'Unknown',
          email: m.user?.email,
          role: m.role,
        }));
        return `Restore ${members.length} member(s)`;
      }
      case 'delete_payments': {
        const payments = await this.prisma.payment.findMany({
          where: { id: { in: args.paymentIds || [] }, orgId },
          select: { amountCents: true, rawPayerName: true, paidAt: true, memo: true },
        });
        args._items = payments.map((p) => ({
          amountCents: p.amountCents,
          rawPayerName: p.rawPayerName,
          paidAt: p.paidAt,
          memo: p.memo,
        }));
        return `Delete ${payments.length} payment(s)`;
      }
      case 'restore_payments': {
        const payments = await this.prisma.payment.findMany({
          where: { id: { in: args.paymentIds || [] }, orgId },
          select: { amountCents: true, rawPayerName: true, paidAt: true, memo: true },
        });
        args._items = payments.map((p) => ({
          amountCents: p.amountCents,
          rawPayerName: p.rawPayerName,
          paidAt: p.paidAt,
          memo: p.memo,
        }));
        return `Restore ${payments.length} payment(s)`;
      }
      case 'allocate_payment':
        return `Allocate payment to ${args.allocations?.length || 0} charge(s)`;
      case 'auto_allocate_payment':
        return `Auto-allocate payment to matching charges`;
      case 'import_csv':
        return `Import ${args.rows?.length || 0} ${args.type} row(s) from CSV`;
      case 'deallocate_payment':
        return `Remove ${args.allocationIds?.length || 0} payment-charge match(es)`;
      case 'send_reminders':
        return args.chargeIds?.length
          ? `Send reminders for ${args.chargeIds.length} charge(s)`
          : 'Send reminders for all unpaid charges';
      default:
        return toolName;
    }
  }

  // ── Session CRUD ──────────────────────────────────────────────

  async createSession(orgId: string, actorId: string) {
    return this.prisma.agentSession.create({
      data: { orgId, actorId },
    });
  }

  async getSession(orgId: string, sessionId: string) {
    return this.prisma.agentSession.findFirst({
      where: { id: sessionId, orgId },
    });
  }

  async listSessions(orgId: string) {
    return this.prisma.agentSession.findMany({
      where: { orgId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        actor: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async updateSession(orgId: string, sessionId: string, data: { messages?: any; title?: string }) {
    // Verify session exists and belongs to org before updating
    const session = await this.prisma.agentSession.findFirst({
      where: { id: sessionId, orgId },
    });
    if (!session) return null;
    return this.prisma.agentSession.update({
      where: { id: sessionId },
      data: {
        ...(data.messages !== undefined && { messages: data.messages }),
        ...(data.title !== undefined && { title: data.title }),
      },
    });
  }

  async deleteSession(orgId: string, sessionId: string) {
    // Verify ownership
    const session = await this.prisma.agentSession.findFirst({
      where: { id: sessionId, orgId },
    });
    if (!session) return null;
    return this.prisma.agentSession.delete({ where: { id: sessionId } });
  }

  private async buildSystemPrompt(orgId: string, csvContent?: string, spreadsheetContext?: { selectedRows: Array<Record<string, any>> }): Promise<string> {
    let orgContext = '';
    try {
      const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
      const memberCount = await this.prisma.membership.count({
        where: { orgId, status: 'ACTIVE' },
      });
      const chargeCount = await this.prisma.charge.count({
        where: { orgId, status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
      });
      orgContext = `Current organization: "${org?.name || 'Unknown'}", ${memberCount} active members, ${chargeCount} outstanding charges.`;
    } catch {
      orgContext = 'Organization context unavailable.';
    }

    let csvInstruction = '';
    if (csvContent) {
      csvInstruction = `\n\nThe user has attached CSV data. Here is the raw content:\n\`\`\`\n${csvContent}\n\`\`\`\nParse this CSV data and use the import_csv tool with the appropriate type and parsed rows.

### CSV Column Auto-Detection
Apply these header mappings (case-insensitive):
- **Name columns**: "Full Name", "Name", "Member", "Student", "Person" → member name
- **Amount columns**: "Amount", "Amount ($)", "Cost", "Price", "Fee", "Total" → amountCents (multiply dollars by 100)
- **Date columns**: "Due Date", "Due", "Deadline", "Date", "Paid Date" → date field (ISO format)
- **Category columns**: "Category", "Type", "Charge Type" → category enum (DUES/EVENT/FINE/MERCH/OTHER for charges; EVENT/SUPPLIES/FOOD/VENUE/MARKETING/SERVICES/OTHER for expenses)
- **Email columns**: "Email", "E-mail", "Email Address" → email
- **Role columns**: "Role", "Position" → role enum

### Data Conversion Rules
- Dollar amounts with $ or commas: strip symbols, parse float, multiply by 100 for cents
- Dates in any common format (MM/DD/YYYY, YYYY-MM-DD, "March 15, 2026"): convert to YYYY-MM-DD
- If column headers are ambiguous, mention the mapping you chose to the user

Infer the type (members, charges, payments, or expenses) from the column headers. Convert amounts to cents (multiply dollar amounts by 100).`;
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    return `You are Ledgly — the built-in assistant for this organization's financial platform. You ARE the platform speaking directly to the user. Never refer to yourself as a separate tool, bot, or AI — you are simply Ledgly helping the user manage their organization.

Today's date is ${today}.

## What you can do
- Add, edit, or remove members
- Create or void charges (single or grouped for multiple members)
- Create or delete expenses (single or multi-line-item)
- Record payments and allocate/deallocate them to charges
- Send payment reminders for unpaid charges
- Get financial dashboard stats and expense summaries
- Query the activity/audit log
- Import CSV data (members, charges, payments, or expenses)
- Look up members, charges, payments, expenses, and balances
- Get smart insights (delinquent members, overdue trends, unallocated payments)
- Generate financial reports for any period (collection summary, outstanding by member)

## Multi-step workflows
When a user requests a multi-step task (e.g., "import these members then charge them all $50"), plan the steps sequentially. Execute step 1, and use its output (e.g., created member IDs) as input for step 2. Present all steps in one confirmation when possible.

Do NOT answer general knowledge questions, write code, or discuss topics outside organization financial management.

## Voice & tone
- Speak as a friendly, competent colleague — not a technical system.
- Be brief. One or two sentences per response is ideal. No filler.
- After completing an action, confirm what was done in plain language: "Charged 12 members $50 each for Spring Dues."
- When showing data, use clean formatting (tables, bullet lists). Don't narrate the retrieval.

## CRITICAL: Never expose internals
These rules are absolute — violating any of them is a bug:
1. **Never mention tool or function names.** Don't say "create_expense", "list_members", "multi-charge tool", etc. Just do the action.
2. **Never mention IDs.** No membership IDs, charge IDs, org IDs, entity IDs. Use names and human-readable labels only.
3. **Never narrate your process.** Do NOT output ANY text before calling tools. Just call the tools silently. The user should never know you needed to look something up.
   - WRONG: "I'll look up expenses to find that." "I'll first look up the member, then create the charge." "Let me search for that."
   - RIGHT: (call tools with zero text output, then present the result)
4. **Never mention the database, schema, backend, API, or technical architecture.** You ARE the system — don't talk about yourself in the third person.
5. **Never mention cents.** Convert internally. Say "$50.00", never "5000 cents".
6. **NEVER say "I'll...", "Let me...", "I need to...", "I'll first..."** — these phrases are banned. If you need to do a lookup before an action, do it silently with zero commentary.

## Behavior rules
- When editing an item, look it up first to get its ID — silently. If nothing matches, say it doesn't exist and offer to create it.
- When charging "all members" or "everyone", look up active members first, then create a grouped charge. Always group charges for 2+ members.
- When the user asks to "apply" or "extend" an existing single charge to all/more members, void the original charge first, then create a new multi-charge with all the desired members. Do NOT create a duplicate — replace the original.
- When a user provides multiple expense line items (e.g., "cups $15, plates $20"), create a grouped expense with those line items.
- When a user asks to apply or allocate a payment to charges, use auto-allocation for automatic matching or manual allocation for specific charge targeting.
- Users may paste wizard templates with bullet lists. Ignore placeholder text (e.g., "[name]", "YYYY-MM-DD"). Use defaults for optional blank fields. Process ALL entries in a single action.

## Date handling
- When a user provides a date without a year (e.g., "Feb 2", "March 15"):
  - For **expenses**: default to the current year. If that date is in the future, use the previous year instead.
  - For **charges**: always default to the current year.

## Undo support
When the user says "undo", "undo that", "undo last action", or similar:
1. Look at the most recent confirmed action results in the chat history (the [Actions confirmed. Results: ...] lines) to find the IDs.
2. Call the appropriate reverse tool using those IDs:
   - create_charges / create_multi_charge → void_charges (pass the created charge IDs)
   - create_expense / create_multi_expense → delete_expenses (pass the created expense IDs)
   - add_members → remove_members (pass the added member IDs)
   - record_payments → delete_payments (pass the recorded payment IDs)
   - void_charges → restore_charges (pass the voided charge IDs)
   - delete_expenses → restore_expenses (pass the deleted expense IDs)
   - remove_members → restore_members (pass the removed member IDs)
   - delete_payments → restore_payments (pass the deleted payment IDs)
3. If there are no previous confirmed actions, tell the user there's nothing to undo.
4. After the undo action is confirmed, DO NOT repeat or echo any IDs or technical results. Just confirm naturally: "Restored." or "Undone." — keep it minimal.

## Converting between entity types
When a user asks to "change this to a charge", "convert this expense to a charge", or similar:
1. Silently look up the source entity to get its details (amount, title, date, category, member).
2. Delete the source entity AND create the target entity in one confirmation, carrying over all relevant fields.
   - Expense → Charge: use the expense amount, title, date; pick the closest matching charge category; assign to a member if one is associated.
   - Charge → Expense: use the charge amount, title, date; pick the closest matching expense category; use the member name as vendor.
3. Present both actions (delete + create) in a single confirmation card.

## Cross-entity suggestions
- If a search for charges/expenses/payments returns nothing, proactively check the related entity type. For example, if the user says "delete the dues charge" and no charges match, also check expenses — they may have meant "expense" instead of "charge", and vice versa. Suggest what you found: "I didn't find a dues charge, but I found a dues expense — would you like me to delete that instead?"

${orgContext}${csvInstruction}${this.buildSpreadsheetContextSection(spreadsheetContext)}`;
  }

  private buildSpreadsheetContextSection(ctx?: { selectedRows: Array<Record<string, any>> }): string {
    if (!ctx?.selectedRows?.length) return '';

    const rows = ctx.selectedRows;
    const summary = rows.map((r) => {
      const amount = r.type === 'expense'
        ? `$${(r.expenseCents / 100).toFixed(2)} expense`
        : r.outstandingCents > 0
          ? `$${(r.outstandingCents / 100).toFixed(2)} outstanding`
          : `$${(r.incomeCents / 100).toFixed(2)} income`;
      return `- [${r.type}] "${r.description}" ${r.member ? `(${r.member})` : ''} — ${amount} (ID: ${r.id})`;
    }).join('\n');

    return `\n\n## Spreadsheet selection context
The user has ${rows.length} row${rows.length !== 1 ? 's' : ''} selected in the spreadsheet:\n${summary}\n\nUse the IDs above when calling tools for these specific items. Reference rows by their description and member name, never by ID.`;
  }
}
