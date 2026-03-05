import { agentTools, toolDefinitions, toolMap } from './agent-tools';

describe('Agent tool definitions', () => {
  it('exports correct number of tools', () => {
    expect(agentTools.length).toBe(16);
    expect(toolDefinitions.length).toBe(16);
  });

  it('every tool has a unique name', () => {
    const names = toolDefinitions.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every tool has a valid input_schema with type "object"', () => {
    for (const tool of toolDefinitions) {
      expect(tool.input_schema.type).toBe('object');
      expect(tool.description).toBeTruthy();
    }
  });

  it('toolMap resolves all tools by name', () => {
    for (const tool of agentTools) {
      expect(toolMap.get(tool.definition.name)).toBe(tool);
    }
  });

  it('read tools do not require confirmation', () => {
    const readNames = ['list_members', 'list_charges', 'list_payments', 'get_balances', 'list_expenses'];
    for (const name of readNames) {
      const tool = toolMap.get(name);
      expect(tool).toBeDefined();
      expect(tool!.requiresConfirmation).toBe(false);
    }
  });

  it('write tools require confirmation', () => {
    const writeNames = [
      'update_member', 'update_charge', 'update_expense',
      'add_members', 'create_charges', 'create_expense',
      'record_payments', 'void_charges', 'remove_members',
      'delete_expenses', 'import_csv',
    ];
    for (const name of writeNames) {
      const tool = toolMap.get(name);
      expect(tool).toBeDefined();
      expect(tool!.requiresConfirmation).toBe(true);
    }
  });

  it('create_charges requires membershipIds, category, title, amountCents', () => {
    const tool = toolDefinitions.find((t) => t.name === 'create_charges')!;
    expect(tool.input_schema.required).toEqual(
      expect.arrayContaining(['membershipIds', 'category', 'title', 'amountCents']),
    );
  });

  it('add_members requires members array', () => {
    const tool = toolDefinitions.find((t) => t.name === 'add_members')!;
    expect(tool.input_schema.required).toContain('members');
  });

  it('import_csv requires type and rows', () => {
    const tool = toolDefinitions.find((t) => t.name === 'import_csv')!;
    expect(tool.input_schema.required).toEqual(
      expect.arrayContaining(['type', 'rows']),
    );
  });

  it('update_member requires membershipId', () => {
    const tool = toolDefinitions.find((t) => t.name === 'update_member')!;
    expect(tool.input_schema.required).toContain('membershipId');
  });

  it('update_charge requires chargeId', () => {
    const tool = toolDefinitions.find((t) => t.name === 'update_charge')!;
    expect(tool.input_schema.required).toContain('chargeId');
  });

  it('update_expense requires expenseId', () => {
    const tool = toolDefinitions.find((t) => t.name === 'update_expense')!;
    expect(tool.input_schema.required).toContain('expenseId');
  });

  it('delete_expenses requires expenseIds', () => {
    const tool = toolDefinitions.find((t) => t.name === 'delete_expenses')!;
    expect(tool.input_schema.required).toContain('expenseIds');
  });

  it('list_expenses has no required fields', () => {
    const tool = toolDefinitions.find((t) => t.name === 'list_expenses')!;
    expect(tool.input_schema.required).toEqual([]);
  });
});
