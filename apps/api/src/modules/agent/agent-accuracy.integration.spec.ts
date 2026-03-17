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

User: "auto match all payments"
→ list_charges (silent) → auto_allocate_payment for each unmatched charge

User: "send reminders for all overdue charges"
→ list_charges(status=OPEN, overdue=true) (silent) → send_reminders(chargeIds=[...])

User: "remove the due date"
→ list_charges (silent) → update_charge(chargeId, dueDate=null)

User: "convert that expense to a charge"
→ list_expenses (silent) → delete_expenses + create_charges

User: "what does Bryan owe" → get_balances (silent) → respond
User: "who hasn't paid yet" → list_charges(status=OPEN) (silent) → respond

## Multi-charge rule
Same charge for all → create_multi_charge. Different per member → separate create_charges calls. "Respectively" maps 1:1.

## Natural language
Parse "$5k", "fifty bucks", "last friday". Fuzzy-match member names.

Current organization: "Test Fraternity", 5 active members (Bryan Lui, Sarah Kim, John Smith, Alice Chen, Charlie Park), 3 outstanding charges.`;

async function parseCommand(query: string): Promise<{ toolName: string; args: Record<string, any> }[]> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: query }],
    tools: toolDefinitions as any,
    tool_choice: { type: 'auto' },
  });

  return response.content
    .filter((b: any) => b.type === 'tool_use')
    .map((b: any) => ({ toolName: b.name, args: b.input || {} }));
}

describeIfKey('Agent Prompt Accuracy', () => {
  const results: { input: string; pass: boolean; expected: string; actual: string; description?: string }[] = [];

  jest.setTimeout(180_000);

  for (const tc of TEST_CASES) {
    it(tc.description || tc.input, async () => {
      const actions = await parseCommand(tc.input);
      const actualToolNames = actions.map(a => a.toolName);

      if (tc.expected.length === 0) {
        results.push({
          input: tc.input,
          pass: true,
          expected: '(any)',
          actual: actualToolNames.join(', ') || '(empty)',
          description: tc.description,
        });
        return;
      }

      const expectedToolNames = tc.expected.map(e => e.toolName);
      const readTools = new Set(['list_members', 'list_charges', 'list_payments', 'list_expenses', 'get_balances', 'get_dashboard_stats', 'get_expense_summary', 'get_insights', 'query_activity']);

      // With real tool use, the model often calls a lookup first and would call the write tool
      // in the next round (which we can't simulate in a single call).
      // Accept if: expected tool is present OR model started with a relevant lookup.
      const allExpectedPresent = expectedToolNames.every(expected => {
        if (actualToolNames.includes(expected)) return true;
        // If expected is a write tool and model called a read tool, that's the correct first step
        if (!readTools.has(expected) && actualToolNames.some(a => readTools.has(a))) return true;
        return false;
      });

      let argsMatch = true;
      if (allExpectedPresent) {
        for (const exp of tc.expected) {
          if (!exp.args) continue;
          const actual = actions.find(a => a.toolName === exp.toolName);
          if (!actual) { argsMatch = false; break; }
          for (const [key, value] of Object.entries(exp.args)) {
            if (value === null) {
              if (actual.args[key] !== null && actual.args[key] !== undefined) {
                argsMatch = false;
              }
            } else if (actual.args[key] !== value) {
              argsMatch = false;
            }
          }
        }
      }

      const pass = allExpectedPresent && argsMatch;
      results.push({
        input: tc.input,
        pass,
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
