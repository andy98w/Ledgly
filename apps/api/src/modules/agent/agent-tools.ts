import type Anthropic from '@anthropic-ai/sdk';

export interface AgentTool {
  definition: Anthropic.Tool;
  requiresConfirmation: boolean;
}

export const agentTools: AgentTool[] = [
  // ── Read tools (no confirmation) ──────────────────────────────
  {
    requiresConfirmation: false,
    definition: {
      name: 'list_members',
      description:
        'List organization members. Returns member names, IDs, roles, statuses, and balances.',
      input_schema: {
        type: 'object' as const,
        properties: {
          search: {
            type: 'string',
            description: 'Optional search string to filter by name or email',
          },
          status: {
            type: 'string',
            enum: ['ACTIVE', 'PENDING', 'REMOVED'],
            description: 'Filter by membership status',
          },
        },
        required: [],
      },
    },
  },
  {
    requiresConfirmation: false,
    definition: {
      name: 'list_charges',
      description:
        'List charges. Returns charge IDs, titles, amounts, statuses, and assigned members.',
      input_schema: {
        type: 'object' as const,
        properties: {
          search: {
            type: 'string',
            description: 'Optional search string to filter by title',
          },
          status: {
            type: 'string',
            enum: ['OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID'],
            description: 'Filter by charge status',
          },
          category: {
            type: 'string',
            enum: ['DUES', 'EVENT', 'FINE', 'MERCH', 'OTHER'],
            description: 'Filter by charge category',
          },
          membershipId: {
            type: 'string',
            description: 'Filter charges for a specific member',
          },
        },
        required: [],
      },
    },
  },
  {
    requiresConfirmation: false,
    definition: {
      name: 'list_payments',
      description:
        'List payments. Returns payment IDs, amounts, payer names, dates, and allocation status.',
      input_schema: {
        type: 'object' as const,
        properties: {
          search: {
            type: 'string',
            description: 'Optional search string to filter by payer name or memo',
          },
          membershipId: {
            type: 'string',
            description: 'Filter payments for a specific member',
          },
          unallocated: {
            type: 'boolean',
            description: 'If true, only return payments not yet allocated to charges',
          },
        },
        required: [],
      },
    },
  },
  {
    requiresConfirmation: false,
    definition: {
      name: 'list_expenses',
      description:
        'List organization expenses. Returns expense IDs, titles, amounts, categories, dates, and vendors.',
      input_schema: {
        type: 'object' as const,
        properties: {
          search: {
            type: 'string',
            description: 'Optional search string to filter by title or vendor',
          },
          category: {
            type: 'string',
            description: 'Filter by expense category',
          },
        },
        required: [],
      },
    },
  },
  {
    requiresConfirmation: false,
    definition: {
      name: 'get_balances',
      description:
        'Get per-member balance summary: total charged, total paid, and outstanding balance for each member.',
      input_schema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },
  },

  // ── Write tools (require confirmation) ────────────────────────
  {
    requiresConfirmation: true,
    definition: {
      name: 'update_member',
      description:
        'Update an existing member. Look up the member first to get their ID, then provide the fields to change.',
      input_schema: {
        type: 'object' as const,
        properties: {
          membershipId: { type: 'string', description: 'The membership ID to update' },
          name: { type: 'string', description: 'New name (optional)' },
          role: {
            type: 'string',
            enum: ['MEMBER', 'TREASURER', 'ADMIN'],
            description: 'New role (optional)',
          },
          status: {
            type: 'string',
            enum: ['ACTIVE', 'REMOVED'],
            description: 'New status (optional)',
          },
        },
        required: ['membershipId'],
      },
    },
  },
  {
    requiresConfirmation: true,
    definition: {
      name: 'update_charge',
      description:
        'Update an existing charge. Look up the charge first to get its ID, then provide the fields to change.',
      input_schema: {
        type: 'object' as const,
        properties: {
          chargeId: { type: 'string', description: 'The charge ID to update' },
          title: { type: 'string', description: 'New title (optional)' },
          amountCents: { type: 'number', description: 'New amount in cents (optional)' },
          dueDate: { type: 'string', description: 'New due date in ISO format YYYY-MM-DD (optional, use null to remove)' },
        },
        required: ['chargeId'],
      },
    },
  },
  {
    requiresConfirmation: true,
    definition: {
      name: 'update_expense',
      description:
        'Update an existing expense. The user must provide enough info to identify the expense. Use list context or ask the user for clarification.',
      input_schema: {
        type: 'object' as const,
        properties: {
          expenseId: { type: 'string', description: 'The expense ID to update' },
          title: { type: 'string', description: 'New title (optional)' },
          amountCents: { type: 'number', description: 'New amount in cents (optional)' },
          category: { type: 'string', description: 'New category (optional)' },
          date: { type: 'string', description: 'New date in ISO format YYYY-MM-DD (optional)' },
          vendor: { type: 'string', description: 'New vendor name (optional)' },
        },
        required: ['expenseId'],
      },
    },
  },
  {
    requiresConfirmation: true,
    definition: {
      name: 'add_members',
      description:
        'Add new members to the organization. Each member needs a name and optionally an email and role.',
      input_schema: {
        type: 'object' as const,
        properties: {
          members: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Member full name' },
                email: { type: 'string', description: 'Member email (optional)' },
                role: {
                  type: 'string',
                  enum: ['MEMBER', 'TREASURER', 'ADMIN'],
                  description: 'Membership role (defaults to MEMBER)',
                },
              },
              required: ['name'],
            },
            description: 'Array of members to add',
          },
        },
        required: ['members'],
      },
    },
  },
  {
    requiresConfirmation: true,
    definition: {
      name: 'create_charges',
      description:
        'Create charges for one or more members. All specified members get the same charge.',
      input_schema: {
        type: 'object' as const,
        properties: {
          membershipIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of membership IDs to charge',
          },
          category: {
            type: 'string',
            enum: ['DUES', 'EVENT', 'FINE', 'MERCH', 'OTHER'],
            description: 'Charge category',
          },
          title: { type: 'string', description: 'Charge title/description' },
          amountCents: {
            type: 'number',
            description: 'Amount in cents (e.g., 5000 for $50.00)',
          },
          dueDate: {
            type: 'string',
            description: 'Optional due date in ISO format (YYYY-MM-DD)',
          },
        },
        required: ['membershipIds', 'category', 'title', 'amountCents'],
      },
    },
  },
  {
    requiresConfirmation: true,
    definition: {
      name: 'create_expense',
      description: 'Record an organization expense.',
      input_schema: {
        type: 'object' as const,
        properties: {
          category: { type: 'string', description: 'Expense category' },
          title: { type: 'string', description: 'Expense title' },
          amountCents: { type: 'number', description: 'Amount in cents' },
          date: { type: 'string', description: 'Expense date (YYYY-MM-DD)' },
          vendor: { type: 'string', description: 'Vendor name (optional)' },
        },
        required: ['category', 'title', 'amountCents', 'date'],
      },
    },
  },
  {
    requiresConfirmation: true,
    definition: {
      name: 'create_multi_charge',
      description:
        'Create a multi-charge: a parent charge with child charges for each selected member. All children share the same amount, category, and title.',
      input_schema: {
        type: 'object' as const,
        properties: {
          membershipIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of membership IDs to charge',
          },
          category: {
            type: 'string',
            enum: ['DUES', 'EVENT', 'FINE', 'MERCH', 'OTHER'],
            description: 'Charge category',
          },
          title: { type: 'string', description: 'Charge title/description' },
          amountCents: {
            type: 'number',
            description: 'Amount in cents per member (e.g., 5000 for $50.00)',
          },
          dueDate: {
            type: 'string',
            description: 'Optional due date in ISO format (YYYY-MM-DD)',
          },
        },
        required: ['membershipIds', 'category', 'title', 'amountCents'],
      },
    },
  },
  {
    requiresConfirmation: true,
    definition: {
      name: 'create_multi_expense',
      description:
        'Create a multi-expense: a parent expense with multiple line-item children. The parent total is the sum of all children.',
      input_schema: {
        type: 'object' as const,
        properties: {
          category: { type: 'string', description: 'Expense category' },
          title: { type: 'string', description: 'Parent expense title' },
          date: { type: 'string', description: 'Expense date (YYYY-MM-DD)' },
          vendor: { type: 'string', description: 'Vendor name (optional)' },
          children: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Line item title' },
                amountCents: { type: 'number', description: 'Line item amount in cents' },
                vendor: { type: 'string', description: 'Line item vendor (optional)' },
              },
              required: ['title', 'amountCents'],
            },
            description: 'Array of line-item expenses',
          },
        },
        required: ['category', 'title', 'date', 'children'],
      },
    },
  },
  {
    requiresConfirmation: true,
    definition: {
      name: 'record_payments',
      description: 'Record one or more payments received.',
      input_schema: {
        type: 'object' as const,
        properties: {
          payments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                amountCents: { type: 'number', description: 'Payment amount in cents' },
                paidAt: { type: 'string', description: 'Payment date (ISO format)' },
                rawPayerName: { type: 'string', description: 'Name of person who paid' },
                memo: { type: 'string', description: 'Payment memo/note (optional)' },
              },
              required: ['amountCents', 'paidAt'],
            },
            description: 'Array of payments to record',
          },
        },
        required: ['payments'],
      },
    },
  },
  {
    requiresConfirmation: true,
    definition: {
      name: 'void_charges',
      description: 'Void (cancel) one or more charges by their IDs.',
      input_schema: {
        type: 'object' as const,
        properties: {
          chargeIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of charge IDs to void',
          },
        },
        required: ['chargeIds'],
      },
    },
  },
  {
    requiresConfirmation: true,
    definition: {
      name: 'remove_members',
      description: 'Remove members from the organization by their membership IDs.',
      input_schema: {
        type: 'object' as const,
        properties: {
          memberIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of membership IDs to remove',
          },
        },
        required: ['memberIds'],
      },
    },
  },
  {
    requiresConfirmation: true,
    definition: {
      name: 'delete_expenses',
      description: 'Delete one or more expenses by their IDs. Look up expenses first to get their IDs.',
      input_schema: {
        type: 'object' as const,
        properties: {
          expenseIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of expense IDs to delete',
          },
        },
        required: ['expenseIds'],
      },
    },
  },
  {
    requiresConfirmation: true,
    definition: {
      name: 'import_csv',
      description:
        'Import data from parsed CSV rows. Use when user provides CSV data or a CSV file.',
      input_schema: {
        type: 'object' as const,
        properties: {
          type: {
            type: 'string',
            enum: ['members', 'charges', 'payments', 'expenses'],
            description: 'The type of data being imported',
          },
          rows: {
            type: 'array',
            items: { type: 'object' },
            description: 'Array of parsed CSV row objects',
          },
        },
        required: ['type', 'rows'],
      },
    },
  },
];

export const toolDefinitions = agentTools.map((t) => t.definition);

export const toolMap = new Map(agentTools.map((t) => [t.definition.name, t]));
