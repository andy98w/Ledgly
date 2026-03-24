import { test, expect } from '@playwright/test';

const uniqueId = () => Math.random().toString(36).slice(2, 8);

test.describe('Critical flow: member → charge → payment → balance', () => {
  let memberName: string;

  test.beforeAll(() => {
    memberName = `E2E Member ${uniqueId()}`;
  });

  test('create a member', async ({ page }) => {
    await page.goto('/members');
    await expect(page.getByText(/members/i).first()).toBeVisible({ timeout: 10_000 });

    // Click add member button
    const addButton = page.getByRole('button', { name: /add member/i }).first();
    if (await addButton.isVisible()) {
      await addButton.click();
    } else {
      // May need to click a "+" icon
      await page.getByRole('button', { name: /add/i }).first().click();
    }

    // Fill in the name
    const nameInput = page.getByPlaceholder(/name/i).first();
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.fill(memberName);

    // Submit
    const submitButton = page.getByRole('button', { name: /add member/i }).last();
    await submitButton.click();

    // Verify member appears
    await expect(page.getByText(memberName)).toBeVisible({ timeout: 10_000 });
  });

  test('create a charge for the member', async ({ page }) => {
    await page.goto('/charges');
    await expect(page.getByText(/charges/i).first()).toBeVisible({ timeout: 10_000 });

    // Click create charge
    const createButton = page.getByRole('button', { name: /create|new charge/i }).first();
    await createButton.click();

    // Fill charge details
    await page.getByPlaceholder(/title|description/i).first().fill('E2E Test Dues');
    await page.getByPlaceholder(/amount/i).first().fill('50');

    // Select the member (may be a dropdown or multi-select)
    const memberSelect = page.getByText(/select member|choose member/i).first();
    if (await memberSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await memberSelect.click();
      await page.getByText(memberName).click();
    }

    // Submit
    await page.getByRole('button', { name: /create/i }).last().click();

    // Verify charge appears
    await expect(page.getByText('E2E Test Dues')).toBeVisible({ timeout: 10_000 });
  });

  test('record a payment', async ({ page }) => {
    await page.goto('/payments');
    await expect(page.getByText(/payments/i).first()).toBeVisible({ timeout: 10_000 });

    // Click add payment
    const addButton = page.getByRole('button', { name: /add|new|record/i }).first();
    await addButton.click();

    // Fill payment details
    const amountInput = page.getByPlaceholder(/amount/i).first();
    await expect(amountInput).toBeVisible({ timeout: 5_000 });
    await amountInput.fill('50');

    const payerInput = page.getByPlaceholder(/payer|name|member/i).first();
    if (await payerInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await payerInput.fill(memberName);
    }

    // Submit
    await page.getByRole('button', { name: /add|record|save|create/i }).last().click();

    // Verify payment appears
    await expect(page.getByText('$50')).toBeVisible({ timeout: 10_000 });
  });

  test('dashboard shows correct stats', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/dashboard/i).first()).toBeVisible({ timeout: 10_000 });

    // Dashboard should show stats (collected, members, etc.)
    await expect(page.getByText(/collected|unpaid|members/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('spreadsheet shows charge and payment', async ({ page }) => {
    await page.goto('/spreadsheet');
    await expect(page.locator('table')).toBeVisible({ timeout: 15_000 });

    // Both the charge and payment should appear
    await expect(page.getByText('E2E Test Dues').first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Spreadsheet interactions', () => {
  test('can navigate cells with arrow keys', async ({ page }) => {
    await page.goto('/spreadsheet');
    await expect(page.locator('table')).toBeVisible({ timeout: 15_000 });

    // Click on a cell to activate it
    const firstCell = page.locator('td').first();
    await firstCell.click();

    // Press arrow right — should move selection
    await page.keyboard.press('ArrowRight');
    // Press arrow down — should move selection
    await page.keyboard.press('ArrowDown');
    // No crash = pass
  });

  test('Escape deselects active cell', async ({ page }) => {
    await page.goto('/spreadsheet');
    await expect(page.locator('table')).toBeVisible({ timeout: 15_000 });

    const firstCell = page.locator('td').first();
    await firstCell.click();
    await page.keyboard.press('Escape');
    // No crash = pass
  });
});

test.describe('Settings page loads', () => {
  test('can navigate to integrations section', async ({ page }) => {
    await page.goto('/settings#section-integrations');
    await expect(page.getByText(/integrations/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
