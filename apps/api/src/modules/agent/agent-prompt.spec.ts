/**
 * AI Agent Prompt Accuracy Test Suite
 *
 * Each test defines a user command and the expected tool call(s).
 * Run against the actual agent to measure prompt accuracy.
 *
 * To run: pnpm --filter api test -- --testPathPattern=agent-prompt
 */

interface ExpectedAction {
  toolName: string;
  args?: Record<string, any>;
}

interface TestCase {
  input: string;
  expected: ExpectedAction[];
  description?: string;
}

// These test cases define what the AI SHOULD do for each input.
// They're used both as documentation and as regression tests.
const TEST_CASES: TestCase[] = [
  // ── Basic CRUD ──────────────────────────────────────────
  {
    input: 'charge everyone $50 for spring dues',
    expected: [{ toolName: 'create_multi_charge', args: { amountCents: 5000, category: 'DUES' } }],
    description: 'Multi-charge to all members',
  },
  {
    input: 'charge Bryan $50 for dues',
    expected: [{ toolName: 'create_charges', args: { amountCents: 5000, category: 'DUES' } }],
    description: 'Single charge to named member',
  },
  {
    input: 'add expense $20 for pizza',
    expected: [{ toolName: 'create_expense', args: { amountCents: 2000 } }],
    description: 'Create single expense',
  },
  {
    input: 'add expenses: cups $15, plates $20, napkins $5',
    expected: [{ toolName: 'create_multi_expense' }],
    description: 'Multi-line expense',
  },
  {
    input: 'record that Bryan paid $50 on venmo',
    expected: [{ toolName: 'record_payments', args: { source: 'venmo' } }],
    description: 'Record manual payment',
  },
  {
    input: 'add member John Smith',
    expected: [{ toolName: 'add_members' }],
    description: 'Add single member',
  },
  {
    input: 'add members Alice, Bob, and Charlie',
    expected: [{ toolName: 'add_members' }],
    description: 'Add multiple members',
  },

  // ── Complex multi-entity ────────────────────────────────
  {
    input: 'charge A $50 and B $30 to Bryan and Sarah respectively',
    expected: [
      { toolName: 'create_charges', args: { amountCents: 5000 } },
      { toolName: 'create_charges', args: { amountCents: 3000 } },
    ],
    description: 'Respectively mapping creates separate charges',
  },
  {
    input: 'charge Bryan $50 for dues and Sarah $30 for event fee',
    expected: [
      { toolName: 'create_charges' },
      { toolName: 'create_charges' },
    ],
    description: 'Different charges for different members = separate calls',
  },
  {
    input: 'charge all members $50 for spring dues and $25 for event',
    expected: [
      { toolName: 'create_multi_charge', args: { amountCents: 5000 } },
      { toolName: 'create_multi_charge', args: { amountCents: 2500 } },
    ],
    description: 'Two different multi-charges to all members',
  },

  // ── Queries ─────────────────────────────────────────────
  {
    input: 'what does Bryan owe',
    expected: [{ toolName: 'get_balances' }],
    description: 'Balance lookup',
  },
  {
    input: 'show me all unpaid charges',
    expected: [{ toolName: 'list_charges' }],
    description: 'List charges with filter',
  },
  {
    input: 'how much have we collected this month',
    expected: [{ toolName: 'get_dashboard_stats' }],
    description: 'Dashboard stats query',
  },
  {
    input: 'show me all expenses',
    expected: [{ toolName: 'list_expenses' }],
    description: 'List expenses',
  },
  {
    input: 'who are our members',
    expected: [{ toolName: 'list_members' }],
    description: 'List members',
  },

  // ── Updates ─────────────────────────────────────────────
  {
    input: 'change the dues charge to $60',
    expected: [{ toolName: 'update_charge', args: { amountCents: 6000 } }],
    description: 'Update charge amount',
  },
  {
    input: 'remove the due date from that charge',
    expected: [{ toolName: 'update_charge', args: { dueDate: null } }],
    description: 'Clear due date',
  },
  {
    input: 'rename the pizza expense to food supplies',
    expected: [{ toolName: 'update_expense', args: { title: 'food supplies' } }],
    description: 'Update expense title',
  },

  // ── Deletions ───────────────────────────────────────────
  {
    input: 'delete the pizza expense',
    expected: [{ toolName: 'delete_expenses' }],
    description: 'Delete expense',
  },
  {
    input: 'void Bryan\'s dues charge',
    expected: [{ toolName: 'void_charges' }],
    description: 'Void charge',
  },
  {
    input: 'remove member Charlie',
    expected: [{ toolName: 'remove_members' }],
    description: 'Remove member',
  },

  // ── Undo/Redo ───────────────────────────────────────────
  {
    input: 'undo that',
    expected: [],
    description: 'Undo should reverse the last action (tool depends on context)',
  },
  {
    input: 'redo',
    expected: [],
    description: 'Redo should re-execute the last undone action',
  },

  // ── Allocation ──────────────────────────────────────────
  {
    input: 'match Bryan\'s payment to his dues charge',
    expected: [{ toolName: 'allocate_payment' }],
    description: 'Manual payment allocation',
  },
  {
    input: 'auto match all payments',
    expected: [{ toolName: 'auto_allocate_payment' }],
    description: 'Auto-allocate payments',
  },

  // ── Reminders ───────────────────────────────────────────
  {
    input: 'send reminders for all overdue charges',
    expected: [{ toolName: 'send_reminders' }],
    description: 'Send reminders',
  },
  {
    input: 'remind Bryan about his dues',
    expected: [{ toolName: 'send_reminders' }],
    description: 'Send reminder to specific member',
  },

  // ── Reports ─────────────────────────────────────────────
  {
    input: 'generate a collection report for this month',
    expected: [{ toolName: 'generate_report' }],
    description: 'Generate report',
  },

  // ── Conversion ──────────────────────────────────────────
  {
    input: 'convert that expense to a charge',
    expected: [
      { toolName: 'delete_expenses' },
      { toolName: 'create_charges' },
    ],
    description: 'Convert expense to charge (delete + create)',
  },

  // ── Natural language variations ─────────────────────────
  {
    input: 'bill the whole org fifty bucks for dues',
    expected: [{ toolName: 'create_multi_charge', args: { amountCents: 5000, category: 'DUES' } }],
    description: 'Informal language: "bill", "fifty bucks", "whole org"',
  },
  {
    input: 'log that we spent $200 on the venue last friday',
    expected: [{ toolName: 'create_expense', args: { amountCents: 20000, category: 'VENUE' } }],
    description: 'Informal language with relative date',
  },
  {
    input: 'who hasn\'t paid yet',
    expected: [{ toolName: 'list_charges' }],
    description: 'Colloquial query about unpaid',
  },
  {
    input: 'how much do we have outstanding',
    expected: [{ toolName: 'get_dashboard_stats' }],
    description: 'Colloquial financial query',
  },

  // ── Edge cases ──────────────────────────────────────────
  {
    input: 'charge Bryan and Bryan $50 each',
    expected: [{ toolName: 'create_multi_charge' }],
    description: 'Duplicate member name should not create duplicates',
  },
  {
    input: 'delete everything',
    expected: [],
    description: 'Dangerous command should be refused or clarified',
  },
  {
    input: 'what\'s the weather today',
    expected: [],
    description: 'Off-topic should be refused',
  },
  {
    input: 'charge $50',
    expected: [],
    description: 'Incomplete command should ask for more details (who?)',
  },
];

// Export for use in integration tests
export { TEST_CASES, TestCase, ExpectedAction };

describe('Agent Prompt Test Cases', () => {
  it('has at least 35 test cases', () => {
    expect(TEST_CASES.length).toBeGreaterThanOrEqual(35);
  });

  it('covers all major tool categories', () => {
    const toolNames = new Set(TEST_CASES.flatMap(t => t.expected.map(e => e.toolName)));
    const requiredTools = [
      'create_charges', 'create_multi_charge', 'create_expense', 'create_multi_expense',
      'record_payments', 'add_members', 'update_charge', 'update_expense',
      'void_charges', 'delete_expenses', 'remove_members',
      'list_charges', 'list_expenses', 'list_members',
      'get_balances', 'get_dashboard_stats',
      'allocate_payment', 'auto_allocate_payment',
      'send_reminders', 'generate_report',
    ];
    for (const tool of requiredTools) {
      expect(toolNames.has(tool)).toBe(true);
    }
  });

  it('has descriptions for all test cases', () => {
    for (const tc of TEST_CASES) {
      expect(tc.description).toBeTruthy();
    }
  });
});
