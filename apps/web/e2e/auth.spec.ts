import { test, expect } from '@playwright/test';

test.describe('Login page', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('renders login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill('bad@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/sign in failed|invalid/i)).toBeVisible({ timeout: 10_000 });
  });

  test('has link to register page', async ({ page }) => {
    await page.goto('/login');
    const signUpLink = page.getByRole('link', { name: /sign up/i });
    await expect(signUpLink).toBeVisible();
    await expect(signUpLink).toHaveAttribute('href', '/register');
  });

  test('forgot password flow shows email form', async ({ page }) => {
    await page.goto('/login');
    await page.getByText('Forgot password?').click();
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  });

  test('unauthenticated user redirected from dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});

test.describe('Register page', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('renders register form', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByLabel('Full name')).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  });

  test('shows password strength indicators', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Password').fill('weak');
    await expect(page.getByText('8+ characters')).toBeVisible();
    await expect(page.getByText('Uppercase letter')).toBeVisible();
    await expect(page.getByText('Lowercase letter')).toBeVisible();
    await expect(page.getByText('Number')).toBeVisible();
  });
});
