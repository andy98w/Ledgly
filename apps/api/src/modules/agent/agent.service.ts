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

  async *chat(
    orgId: string,
    actorId: string,
    messages: ChatMessage[],
    csvContent?: string,
  ): AsyncGenerator<SSEEvent> {
    try {
      const systemPrompt = await this.buildSystemPrompt(orgId, csvContent);

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
          const actions: ProposedAction[] = writeTools.map((b) => ({
            id: b.id,
            toolName: b.name,
            args: b.input as Record<string, any>,
            description: this.describeAction(b.name, b.input as Record<string, any>),
          }));
          yield { type: 'tool_calls', actions };
          continueLoop = false;
          break;
        }

        if (readTools.length > 0) {
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
    const batch = this.auditService.createBatchContext('AI Agent action', 'AI_AGENT');
    const results: Array<{ toolName: string; success: boolean; message: string; details?: any; skipped?: Array<{ id: string; reason: string }> }> = [];

    for (const action of actions) {
      try {
        const result = await this.executeWriteTool(orgId, actorId, action.toolName, action.args, batch);
        let message = this.describeAction(action.toolName, action.args);

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
        return result.data.map((m: any) => ({
          id: m.id,
          name: m.name || m.user?.name,
          email: m.user?.email,
          role: m.role,
          status: m.status,
          balanceCents: m.balanceCents,
        }));
      }

      case 'list_charges': {
        const result = await this.chargesService.findAll(orgId, {
          status: args.status,
          category: args.category,
          membershipId: args.membershipId,
          limit: 200,
        });
        return result.data.map((c: any) => ({
          id: c.id,
          title: c.title,
          amountCents: c.amountCents,
          status: c.status,
          category: c.category,
          memberName: c.membership?.name || c.membership?.user?.name,
          membershipId: c.membershipId,
          dueDate: c.dueDate,
        }));
      }

      case 'list_payments': {
        const filters: any = {};
        if (args.membershipId) filters.membershipId = args.membershipId;
        if (args.unallocated) filters.unallocated = true;
        const result = await this.paymentsService.findAll(orgId, { ...filters, limit: 200 });
        return result.data.map((p: any) => ({
          id: p.id,
          amountCents: p.amountCents,
          paidAt: p.paidAt,
          rawPayerName: p.rawPayerName,
          memo: p.memo,
          memberName: p.membership?.name || p.membership?.user?.name,
          allocatedCents: p.allocatedCents,
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

      default:
        throw new Error(`Unknown read tool: ${toolName}`);
    }
  }

  private async executeWriteTool(
    orgId: string,
    actorId: string,
    toolName: string,
    args: Record<string, any>,
    batch?: { batchId: string; batchDescription: string },
  ): Promise<any> {
    // ── Input validation ────────────────────────────────────────
    this.validateWriteArgs(toolName, args);

    switch (toolName) {
      case 'add_members':
        return this.membersService.createMany(orgId, args.members, actorId);

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
          category: args.category,
          title: args.title,
          amountCents: args.amountCents,
          date: args.date,
          vendor: args.vendor,
        });

      case 'record_payments':
        return this.paymentsService.bulkCreate(orgId, actorId, args.payments);

      case 'void_charges':
        return this.chargesService.bulkVoid(orgId, args.chargeIds, actorId);

      case 'remove_members':
        return this.membersService.bulkRemove(orgId, args.memberIds, actorId);

      case 'import_csv':
        return this.executeImport(orgId, actorId, args.type, args.rows);

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
        if (args.category) this.validateStringLength(args.category, 'category');
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

      case 'import_csv':
        if (!args.type || !['members', 'charges', 'payments', 'expenses'].includes(args.type))
          throw new Error('type must be one of: members, charges, payments, expenses');
        if (!Array.isArray(args.rows) || args.rows.length === 0)
          throw new Error('rows array is required and cannot be empty');
        if (args.rows.length > AgentService.MAX_CSV_ROWS)
          throw new Error(`CSV import limited to ${AgentService.MAX_CSV_ROWS} rows at a time`);
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

  private validateStringLength(value: string, fieldName: string): void {
    if (value.length > AgentService.MAX_STRING_LENGTH)
      throw new Error(`${fieldName} cannot exceed ${AgentService.MAX_STRING_LENGTH} characters`);
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

  private describeAction(toolName: string, args: Record<string, any>): string {
    switch (toolName) {
      case 'add_members':
        return `Add ${args.members?.length || 0} member(s)`;
      case 'create_charges':
        return `Create charge "${args.title}" ($${((args.amountCents || 0) / 100).toFixed(2)}) for ${args.membershipIds?.length || 0} member(s)`;
      case 'create_expense':
        return `Record expense "${args.title}" ($${((args.amountCents || 0) / 100).toFixed(2)})`;
      case 'record_payments':
        return `Record ${args.payments?.length || 0} payment(s)`;
      case 'void_charges':
        return `Void ${args.chargeIds?.length || 0} charge(s)`;
      case 'remove_members':
        return `Remove ${args.memberIds?.length || 0} member(s)`;
      case 'import_csv':
        return `Import ${args.rows?.length || 0} ${args.type} row(s) from CSV`;
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

  private async buildSystemPrompt(orgId: string, csvContent?: string): Promise<string> {
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
      csvInstruction = `\n\nThe user has attached CSV data. Here is the raw content:\n\`\`\`\n${csvContent}\n\`\`\`\nParse this CSV data and use the import_csv tool with the appropriate type and parsed rows. Infer the type (members, charges, payments, or expenses) from the column headers. Convert amounts to cents (multiply dollar amounts by 100).`;
    }

    return `You are Ledgly Assistant, a financial operations agent for organization management.

You can ONLY perform these actions:
- Add or remove members
- Create or void charges
- Create expenses
- Record payments
- Import CSV data (members, charges, payments, or expenses)
- Look up members, charges, payments, and balances

Do NOT answer general knowledge questions, write code, or discuss topics outside of organization financial management. If asked, politely redirect to the available actions.

When performing write operations, always call the appropriate tool. Do not just describe what you would do.

When creating charges for "all members" or "everyone", first call list_members to get all active member IDs, then create_charges with those IDs.

When the user mentions dollar amounts, convert to cents (e.g., $50 = 5000 cents).

Keep responses concise and action-oriented.

${orgContext}${csvInstruction}`;
  }
}
