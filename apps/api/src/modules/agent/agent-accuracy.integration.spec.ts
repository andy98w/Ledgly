import { TEST_CASES } from './agent-prompt.spec';
import { toolDefinitions } from './agent-tools';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const describeIfKey = ANTHROPIC_API_KEY ? describe : describe.skip;

const today = new Date().toISOString().slice(0, 10);

const SYSTEM_PROMPT = `You are Ledgly — the built-in assistant for this organization's financial platform.

Today's date is ${today}.

## What you can do
- Add, edit, or remove members
- Create or void charges (single or grouped for multiple members)
- Create or delete expenses (single or multi-line-item)
- Record payments and allocate/deallocate them to charges
- Send payment reminders for unpaid charges
- Get financial dashboard stats and expense summaries
- Look up members, charges, payments, expenses, and balances

## Examples
User: "charge everyone $50 for spring dues"
→ list_members (silent) → create_multi_charge(membershipIds=all, amountCents=5000, category=DUES, title="Spring Dues")

User: "charge Bryan $50 for dues and Sarah $30 for event fee"
→ list_members (silent) → create_charges(Bryan, 5000, DUES, "Dues") + create_charges(Sarah, 3000, EVENT, "Event Fee")

User: "charge X, Y, Z to A, B, C respectively"
→ list_members (silent) → create_charges(A, X) + create_charges(B, Y) + create_charges(C, Z)

User: "add expense: cups $15, plates $20, napkins $5"
→ create_multi_expense(title="Event Supplies", children=[...])

User: "record that Bryan paid $50 on venmo"
→ list_members (silent) → record_payments([{membershipId=Bryan, amount=5000, source="venmo"}])

User: "auto match all payments" → list_charges (silent) → auto_allocate_payment
User: "send reminders for all overdue charges" → list_charges (silent) → send_reminders
User: "remove the due date" → list_charges (silent) → update_charge(dueDate=null)
User: "convert that expense to a charge" → list_expenses (silent) → delete_expenses + create_charges
User: "what does Bryan owe" → get_balances (silent) → respond
User: "who hasn't paid yet" → list_charges(status=OPEN) → respond

## Multi-charge rule
Same charge for all → create_multi_charge. Different per member → separate create_charges. "Respectively" maps 1:1.

## Natural language
Parse "$5k", "fifty bucks", "last friday". Fuzzy-match member names.

Current organization: "Test Fraternity", 5 active members (Bryan Lui, Sarah Kim, John Smith, Alice Chen, Charlie Park), 3 outstanding charges.`;

// Fake data to feed back when the model calls read tools
const FAKE_TOOL_RESULTS: Record<string, string> = {
  list_members: JSON.stringify([
    { id: 'mem_bryan', name: 'Bryan Lui', displayName: 'Bryan Lui', role: 'MEMBER', status: 'ACTIVE', balanceCents: 5000 },
    { id: 'mem_sarah', name: 'Sarah Kim', displayName: 'Sarah Kim', role: 'MEMBER', status: 'ACTIVE', balanceCents: 3000 },
    { id: 'mem_john', name: 'John Smith', displayName: 'John Smith', role: 'MEMBER', status: 'ACTIVE', balanceCents: 0 },
    { id: 'mem_alice', name: 'Alice Chen', displayName: 'Alice Chen', role: 'MEMBER', status: 'ACTIVE', balanceCents: 0 },
    { id: 'mem_charlie', name: 'Charlie Park', displayName: 'Charlie Park', role: 'MEMBER', status: 'ACTIVE', balanceCents: 0 },
  ]),
  list_charges: JSON.stringify([
    { id: 'ch_1', title: 'Spring Dues', amountCents: 5000, category: 'DUES', status: 'OPEN', membershipId: 'mem_bryan', dueDate: '2026-03-16', membership: { displayName: 'Bryan Lui' } },
    { id: 'ch_2', title: 'Event Fee', amountCents: 3000, category: 'EVENT', status: 'OPEN', membershipId: 'mem_sarah', dueDate: null, membership: { displayName: 'Sarah Kim' } },
    { id: 'ch_3', title: 'Charge', amountCents: 1000, category: 'DUES', status: 'OPEN', membershipId: 'mem_bryan', dueDate: '2026-03-16', membership: { displayName: 'Bryan Lui' } },
  ]),
  list_payments: JSON.stringify([
    { id: 'pay_1', amountCents: 5000, rawPayerName: 'Bryan Lui', source: 'venmo', paidAt: '2026-03-10', membershipId: 'mem_bryan', unallocatedCents: 5000 },
  ]),
  list_expenses: JSON.stringify([
    { id: 'exp_1', title: 'pizza', amountCents: 2000, category: 'FOOD', vendor: 'Pizza Place', date: '2026-03-14' },
  ]),
  get_balances: JSON.stringify([
    { memberName: 'Bryan Lui', balanceCents: 5000, totalChargedCents: 6000, totalPaidCents: 1000 },
    { memberName: 'Sarah Kim', balanceCents: 3000, totalChargedCents: 3000, totalPaidCents: 0 },
  ]),
  get_dashboard_stats: JSON.stringify({
    totalCollectedCents: 100000, totalOutstandingCents: 80000, memberCount: 5,
    overdueCount: 2, openChargesCount: 3, recentPayments: [],
  }),
  get_expense_summary: JSON.stringify({ totalCents: 20000, count: 1 }),
  get_insights: JSON.stringify({ overdue: 2, unmatched: 1 }),
  query_activity: JSON.stringify([]),
};

const READ_TOOLS = new Set(Object.keys(FAKE_TOOL_RESULTS));

async function parseCommand(query: string): Promise<{ toolName: string; args: Record<string, any> }[]> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const allToolCalls: { toolName: string; args: Record<string, any> }[] = [];
  let messages: any[] = [{ role: 'user', content: query }];

  // Multi-turn: up to 3 rounds to let the model do lookups then act
  for (let round = 0; round < 3; round++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages,
      tools: toolDefinitions as any,
      tool_choice: { type: 'auto' },
    });

    const toolUses = response.content.filter((b: any) => b.type === 'tool_use');

    if (toolUses.length === 0) break;

    for (const tu of toolUses) {
      const block = tu as any;
      allToolCalls.push({ toolName: block.name, args: block.input || {} });
    }

    // If any are read tools, feed back fake results and continue
    const hasReadTool = toolUses.some((tu: any) => READ_TOOLS.has(tu.name));
    if (!hasReadTool) break;

    // Build assistant message with tool uses + tool results
    messages.push({ role: 'assistant', content: response.content });
    const toolResults = toolUses.map((tu: any) => ({
      type: 'tool_result',
      tool_use_id: tu.id,
      content: FAKE_TOOL_RESULTS[tu.name] || '{}',
    }));
    messages.push({ role: 'user', content: toolResults });
  }

  return allToolCalls;
}

describeIfKey('Agent Prompt Accuracy', () => {
  const results: { input: string; pass: boolean; expected: string; actual: string; description?: string }[] = [];

  jest.setTimeout(300_000);

  for (const tc of TEST_CASES) {
    it(tc.description || tc.input, async () => {
      const actions = await parseCommand(tc.input);
      const actualToolNames = actions.map(a => a.toolName);

      if (tc.expected.length === 0) {
        results.push({
          input: tc.input, pass: true,
          expected: '(any)', actual: actualToolNames.join(', ') || '(empty)',
          description: tc.description,
        });
        return;
      }

      const expectedToolNames = tc.expected.map(e => e.toolName);

      const allExpectedPresent = expectedToolNames.every(expected =>
        actualToolNames.includes(expected),
      );

      let argsMatch = true;
      if (allExpectedPresent) {
        for (const exp of tc.expected) {
          if (!exp.args) continue;
          const actual = actions.find(a => a.toolName === exp.toolName);
          if (!actual) { argsMatch = false; break; }
          for (const [key, value] of Object.entries(exp.args)) {
            if (value === null) {
              if (actual.args[key] !== null && actual.args[key] !== undefined) argsMatch = false;
            } else if (actual.args[key] !== value) {
              argsMatch = false;
            }
          }
        }
      }

      const pass = allExpectedPresent && argsMatch;
      results.push({
        input: tc.input, pass,
        expected: expectedToolNames.join(', '),
        actual: actualToolNames.join(', ') || '(empty)',
        description: tc.description,
      });

      expect(allExpectedPresent).toBe(true);
      if (allExpectedPresent) expect(argsMatch).toBe(true);
    });
  }

  afterAll(() => {
    const passed = results.filter(r => r.pass).length;
    const total = results.length;
    const rate = total > 0 ? Math.round((passed / total) * 100) : 0;

    console.log('\n' + '='.repeat(60));
    console.log(`PROMPT ACCURACY: ${passed}/${total} (${rate}%)`);
    console.log('='.repeat(60));

    const failures = results.filter(r => !r.pass);
    if (failures.length > 0) {
      console.log('\nFailed cases:');
      for (const f of failures) {
        console.log(`  ✗ "${f.input}"`);
        console.log(`    Expected: ${f.expected}`);
        console.log(`    Actual:   ${f.actual}`);
      }
    }
    console.log('');
  });
});
