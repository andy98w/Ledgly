import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    }
  }

  async sendAdminInvitation(email: string, orgName: string, inviterName: string, inviteToken?: string): Promise<void> {
    const from = this.configService.get<string>('EMAIL_FROM', 'Ledgly <noreply@ledgly.app>');
    const webUrl = this.configService.get<string>('WEB_URL', 'http://localhost:3000');
    const registerUrl = inviteToken
      ? `${webUrl}/register?invite=${inviteToken}`
      : `${webUrl}/register?email=${encodeURIComponent(email)}`;

    if (!this.resend) {
      this.logger.warn(`Resend not configured — skipping admin invitation email to ${email}`);
      return;
    }

    try {
      await this.resend.emails.send({
        from,
        to: email,
        subject: `You've been invited to join ${orgName} on Ledgly`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background-color: #f5f5f5;">
              <div style="max-width: 480px; margin: 0 auto; background: white; padding: 32px; border-radius: 8px;">
                <h1 style="margin: 0 0 24px; font-size: 24px; color: #111;">You're invited!</h1>
                <p style="margin: 0 0 24px; color: #666; line-height: 1.5;">
                  ${inviterName} has invited you to join <strong>${orgName}</strong> as an administrator on Ledgly. This invitation expires in 7 days.
                </p>
                <a href="${registerUrl}" style="display: inline-block; background: #111; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
                  Create Account
                </a>
                <p style="margin: 24px 0 0; color: #999; font-size: 14px;">
                  If you didn't expect this invitation, you can safely ignore it.
                </p>
              </div>
            </body>
          </html>
        `,
      });
    } catch (error) {
      this.logger.error('Failed to send admin invitation email', error);
      throw error;
    }
  }

  async sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
    const from = this.configService.get<string>('EMAIL_FROM', 'Ledgly <noreply@ledgly.app>');

    if (!this.resend) {
      this.logger.warn(`Resend not configured — skipping password reset email to ${email}`);
      return;
    }

    try {
      await this.resend.emails.send({
        from,
        to: email,
        subject: 'Reset your Ledgly password',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background-color: #f5f5f5;">
              <div style="max-width: 480px; margin: 0 auto; background: white; padding: 32px; border-radius: 8px;">
                <h1 style="margin: 0 0 24px; font-size: 24px; color: #111;">Reset your password</h1>
                <p style="margin: 0 0 24px; color: #666; line-height: 1.5;">
                  Click the button below to reset your password. This link will expire in 15 minutes.
                </p>
                <a href="${resetLink}" style="display: inline-block; background: #111; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
                  Reset Password
                </a>
                <p style="margin: 24px 0 0; color: #999; font-size: 14px;">
                  If you didn't request this email, you can safely ignore it. Your password won't be changed.
                </p>
              </div>
            </body>
          </html>
        `,
      });
    } catch (error) {
      this.logger.error('Failed to send password reset email', error);
      throw error;
    }
  }

  async sendMagicLink(email: string, magicLink: string): Promise<void> {
    const from = this.configService.get<string>('EMAIL_FROM', 'Ledgly <noreply@ledgly.app>');

    if (!this.resend) {
      this.logger.warn(`Resend not configured — skipping magic link email to ${email}`);
      return;
    }

    try {
      await this.resend.emails.send({
        from,
        to: email,
        subject: 'Sign in to Ledgly',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background-color: #f5f5f5;">
              <div style="max-width: 480px; margin: 0 auto; background: white; padding: 32px; border-radius: 8px;">
                <h1 style="margin: 0 0 24px; font-size: 24px; color: #111;">Sign in to Ledgly</h1>
                <p style="margin: 0 0 24px; color: #666; line-height: 1.5;">
                  Click the button below to sign in to your account. This link will expire in 15 minutes.
                </p>
                <a href="${magicLink}" style="display: inline-block; background: #111; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
                  Sign in to Ledgly
                </a>
                <p style="margin: 24px 0 0; color: #999; font-size: 14px;">
                  If you didn't request this email, you can safely ignore it.
                </p>
              </div>
            </body>
          </html>
        `,
      });
    } catch (error) {
      this.logger.error('Failed to send magic link email', error);
      throw error;
    }
  }
}
