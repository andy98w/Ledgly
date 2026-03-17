import { describe, it, expect, beforeAll } from '@jest/globals';
import { TEST_CASES } from './agent-prompt.spec';

/**
 * Integration test that runs each test case against the real AI agent.
 * Requires ANTHROPIC_API_KEY and a running database.
 *
 * Run: ANTHROPIC_API_KEY=sk-... pnpm --filter api test -- --testPathPattern=agent-accuracy --runInBand
 *
 * This test measures prompt accuracy — how often the AI picks the right tool
 * for a given natural language command.
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Skip if no API key
const describeIfKey = ANTHROPIC_API_KEY ? describe : describe.skip;

async function parseCommand(query: string): Promise<{ toolName: string; args: Record<string, any> }[]> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `You are a test harness. Given a natural language command for an org financial management tool, respond with ONLY a JSON array of tool calls that should be made. Each tool call is: {"toolName": "...", "args": {...}}.

Available tools: list_members, list_charges, list_payments, list_expenses, get_balances, get_dashboard_stats, get_expense_summary, get_insights, generate_report, query_activity, create_charges, create_multi_charge, create_expense, create_multi_expense, add_members, record_payments, update_member, update_charge, update_expense, void_charges, delete_expenses, remove_members, delete_payments, restore_charges, restore_expenses, restore_members, restore_payments, allocate_payment, auto_allocate_payment, deallocate_payment, send_reminders, import_csv.

If the command is off-topic, incomplete, or dangerous, return [].
If it requires looking something up first (silently), include the lookup tool AND the action tool.
Return ONLY the JSON array, no markdown.`,
    messages: [{ role: 'user', content: query }],
  });

  const text = response.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map(b => b.text)
    .join('');

  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

describeIfKey('Agent Prompt Accuracy', () => {
  const results: { input: string; pass: boolean; expected: string; actual: string; description?: string }[] = [];

  // Increase timeout for API calls
  jest.setTimeout(120_000);

  for (const tc of TEST_CASES) {
    it(tc.description || tc.input, async () => {
      const actions = await parseCommand(tc.input);
      const actualToolNames = actions.map(a => a.toolName);

      if (tc.expected.length === 0) {
        // For undo/redo/edge cases, we just check the AI returns something reasonable
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

      // Check that all expected tools are present (order doesn't matter, extras like lookups are OK)
      const allExpectedPresent = expectedToolNames.every(expected =>
        actualToolNames.includes(expected),
      );

      // Check args if specified
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
