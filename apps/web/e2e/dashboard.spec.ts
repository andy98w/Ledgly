import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('loads dashboard page', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/dashboard/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('sidebar navigation visible', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: /charges/i }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: /payments/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /expenses/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /members/i }).first()).toBeVisible();
  });
});

test.describe('Charges page', () => {
  test('loads charges list', async ({ page }) => {
    await page.goto('/charges');
    await expect(page).toHaveURL(/\/charges/);
    await expect(page.getByText(/charges/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Payments page', () => {
  test('loads payments list', async ({ page }) => {
    await page.goto('/payments');
    await expect(page).toHaveURL(/\/payments/);
    await expect(page.getByText(/payments/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Expenses page', () => {
  test('loads expenses list', async ({ page }) => {
    await page.goto('/expenses');
    await expect(page).toHaveURL(/\/expenses/);
    await expect(page.getByText(/expenses/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Members page', () => {
  test('loads members list', async ({ page }) => {
    await page.goto('/members');
    await expect(page).toHaveURL(/\/members/);
    await expect(page.getByText(/members/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Spreadsheet page', () => {
  test('loads spreadsheet view', async ({ page }) => {
    await page.goto('/spreadsheet');
    await expect(page).toHaveURL(/\/spreadsheet/);
    await expect(page.locator('table')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Settings page', () => {
  test('loads settings', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByText(/settings/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
