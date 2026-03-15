import { test as setup, expect } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_EMAIL || 'test@ledgly.app';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPassword1';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

  await page.getByLabel('Email address').fill(TEST_EMAIL);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for redirect to dashboard or onboarding
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

  await page.context().storageState({ path: './e2e/.auth/user.json' });
});
