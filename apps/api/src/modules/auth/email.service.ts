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
    const webUrl = this.configService.get<string>('WEB_URL');
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

  async sendEmailVerification(email: string, name: string, token: string): Promise<void> {
    const from = this.configService.get<string>('EMAIL_FROM', 'Ledgly <noreply@ledgly.app>');
    const webUrl = this.configService.get<string>('WEB_URL');
    const verifyLink = `${webUrl}/verify-email?token=${token}`;

    if (!this.resend) {
      this.logger.warn(`Resend not configured — skipping verification email to ${email}`);
      return;
    }

    try {
      await this.resend.emails.send({
        from,
        to: email,
        subject: 'Verify your email — Ledgly',
        html: this.wrapTemplate(`
          <h1 style="margin: 0 0 24px; font-size: 24px; color: #111;">Verify your email</h1>
          <p style="margin: 0 0 24px; color: #666; line-height: 1.5;">
            Hi${name ? ` ${name}` : ''}, click the button below to verify your email address and activate your account. This link expires in 24 hours.
          </p>
          <a href="${verifyLink}" style="display: inline-block; background: #111; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
            Verify Email
          </a>
          <p style="margin: 24px 0 0; color: #999; font-size: 14px;">
            If you didn't create an account on Ledgly, you can safely ignore this email.
          </p>
        `),
      });
    } catch (error) {
      this.logger.error('Failed to send verification email', error);
      throw error;
    }
  }

  async sendPaymentReceipt(email: string, payerName: string, amount: string, orgName: string): Promise<void> {
    const from = this.configService.get<string>('EMAIL_FROM', 'Ledgly <noreply@ledgly.app>');

    if (!this.resend) {
      this.logger.warn(`Resend not configured — skipping payment receipt to ${email}`);
      return;
    }

    try {
      await this.resend.emails.send({
        from,
        to: email,
        subject: `Payment received: $${amount} from ${payerName}`,
        html: this.wrapTemplate(`
          <h1 style="margin: 0 0 24px; font-size: 24px; color: #111;">Payment Received</h1>
          <p style="margin: 0 0 8px; color: #666; line-height: 1.5;">
            <strong>${payerName}</strong> paid <strong>$${amount}</strong> to ${orgName}.
          </p>
          <p style="margin: 0 0 24px; color: #999; font-size: 14px;">
            ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        `),
      });
    } catch (error) {
      this.logger.error('Failed to send payment receipt', error);
    }
  }

  async sendChargeNotification(
    email: string,
    memberName: string,
    chargeTitle: string,
    amount: string,
    orgName: string,
    dueDate: string | null,
    paymentHandles?: Record<string, string>,
    enabledSources?: string[],
  ): Promise<void> {
    const from = this.configService.get<string>('EMAIL_FROM', 'Ledgly <noreply@ledgly.app>');

    if (!this.resend) {
      this.logger.warn(`Resend not configured — skipping charge notification to ${email}`);
      return;
    }

    const greeting = memberName ? `Hi ${memberName.split(' ')[0]},` : 'Hi,';
    const dueLine = dueDate ? `<p style="margin: 0 0 4px; color: #999; font-size: 13px;">Due ${dueDate}</p>` : '';

    let paymentLinksHtml = '';
    if (paymentHandles && enabledSources) {
      const links: string[] = [];
      const buttonStyle = 'display: inline-block; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; margin: 4px;';
      if (enabledSources.includes('venmo') && paymentHandles.venmo) {
        const handle = paymentHandles.venmo.replace(/^@/, '');
        const url = `https://account.venmo.com/pay?recipients=${encodeURIComponent(handle)}&amount=${amount}&note=${encodeURIComponent(chargeTitle)}`;
        links.push(`<a href="${url}" style="${buttonStyle} background: #008CFF; color: white;">Pay $${amount} on Venmo</a>`);
      }
      if (enabledSources.includes('cashapp') && paymentHandles.cashapp) {
        const handle = paymentHandles.cashapp.replace(/^\$/, '');
        const url = `https://cash.app/$${handle}/${amount}`;
        links.push(`<a href="${url}" style="${buttonStyle} background: #00D632; color: white;">Pay $${amount} on Cash App</a>`);
      }
      if (enabledSources.includes('paypal') && paymentHandles.paypal) {
        const url = `https://paypal.me/${paymentHandles.paypal}/${amount}`;
        links.push(`<a href="${url}" style="${buttonStyle} background: #0070BA; color: white;">Pay $${amount} on PayPal</a>`);
      }
      if (enabledSources.includes('zelle') && paymentHandles.zelle) {
        links.push(`<p style="margin: 8px 0 0; font-size: 13px; color: #666;">Pay via Zelle to: <strong>${paymentHandles.zelle}</strong></p>`);
      }
      if (links.length > 0) {
        paymentLinksHtml = `
          <div style="margin: 24px 0 0; padding: 20px 0 0; border-top: 1px solid #eee;">
            <p style="margin: 0 0 12px; font-size: 13px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;">Pay now</p>
            <div style="text-align: center;">${links.join('\n')}</div>
          </div>`;
      }
    }

    try {
      const unsub = this.unsubscribeUrl(email);
      await this.resend.emails.send({
        from,
        to: email,
        subject: `${orgName}: New charge — ${chargeTitle} ($${amount})`,
        headers: {
          'List-Unsubscribe': `<${unsub}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        html: this.wrapTemplate(`
          <p style="margin: 0 0 20px; color: #666; font-size: 15px; line-height: 1.5;">${greeting}</p>
          <p style="margin: 0 0 16px; color: #666; font-size: 14px;">You've been charged by <strong>${orgName}</strong>:</p>
          <div style="background: #F0F9FF; border-left: 4px solid #3B82F6; border-radius: 8px; padding: 16px 20px; margin: 0 0 20px;">
            <p style="margin: 0 0 4px; font-size: 20px; font-weight: 700; color: #111;">$${amount}</p>
            <p style="margin: 0 0 4px; color: #333; font-size: 15px; font-weight: 500;">${chargeTitle}</p>
            ${dueLine}
          </div>
          ${paymentLinksHtml}
          <p style="margin: 24px 0 0; color: #bbb; font-size: 12px;">
            Sent via Ledgly on behalf of ${orgName}
          </p>
          ${this.unsubscribeFooter(email)}
        `),
      });
    } catch (error) {
      this.logger.error('Failed to send charge notification', error);
    }
  }

  async sendOverdueReminder(
    email: string,
    chargeTitle: string,
    amount: string,
    orgName: string,
    dueDate: string | null,
    memberName?: string,
    paymentHandles?: Record<string, string>,
    enabledSources?: string[],
  ): Promise<void> {
    const from = this.configService.get<string>('EMAIL_FROM', 'Ledgly <noreply@ledgly.app>');

    if (!this.resend) {
      this.logger.warn(`Resend not configured — skipping overdue reminder to ${email}`);
      return;
    }

    const greeting = memberName ? `Hi ${memberName.split(' ')[0]},` : 'Hi,';
    const dueLine = dueDate ? `<p style="margin: 0 0 4px; color: #999; font-size: 13px;">Due ${dueDate}</p>` : '';

    let paymentLinksHtml = '';
    if (paymentHandles && enabledSources) {
      const links: string[] = [];
      const buttonStyle = 'display: inline-block; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; margin: 4px;';
      if (enabledSources.includes('venmo') && paymentHandles.venmo) {
        const handle = paymentHandles.venmo.replace(/^@/, '');
        const url = `https://account.venmo.com/pay?recipients=${encodeURIComponent(handle)}&amount=${amount}&note=${encodeURIComponent(chargeTitle)}`;
        links.push(`<a href="${url}" style="${buttonStyle} background: #008CFF; color: white;">Pay $${amount} on Venmo</a>`);
      }
      if (enabledSources.includes('cashapp') && paymentHandles.cashapp) {
        const handle = paymentHandles.cashapp.replace(/^\$/, '');
        const url = `https://cash.app/$${handle}/${amount}`;
        links.push(`<a href="${url}" style="${buttonStyle} background: #00D632; color: white;">Pay $${amount} on Cash App</a>`);
      }
      if (enabledSources.includes('paypal') && paymentHandles.paypal) {
        const url = `https://paypal.me/${paymentHandles.paypal}/${amount}`;
        links.push(`<a href="${url}" style="${buttonStyle} background: #0070BA; color: white;">Pay $${amount} on PayPal</a>`);
      }
      if (enabledSources.includes('zelle') && paymentHandles.zelle) {
        links.push(`<p style="margin: 8px 0 0; font-size: 13px; color: #666;">Pay via Zelle to: <strong>${paymentHandles.zelle}</strong></p>`);
      }
      if (links.length > 0) {
        paymentLinksHtml = `
          <div style="margin: 24px 0 0; padding: 20px 0 0; border-top: 1px solid #eee;">
            <p style="margin: 0 0 12px; font-size: 13px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;">Pay now</p>
            <div style="text-align: center;">${links.join('\n')}</div>
          </div>`;
      }
    }

    try {
      const unsub = this.unsubscribeUrl(email);
      await this.resend.emails.send({
        from,
        to: email,
        subject: `${orgName}: $${amount} due for ${chargeTitle}`,
        headers: {
          'List-Unsubscribe': `<${unsub}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        html: this.wrapTemplate(`
          <p style="margin: 0 0 20px; color: #666; font-size: 15px; line-height: 1.5;">${greeting}</p>
          <div style="background: #FEF2F2; border-left: 4px solid #EF4444; border-radius: 8px; padding: 16px 20px; margin: 0 0 20px;">
            <p style="margin: 0 0 4px; font-size: 20px; font-weight: 700; color: #111;">$${amount}</p>
            <p style="margin: 0 0 4px; color: #333; font-size: 15px; font-weight: 500;">${chargeTitle}</p>
            ${dueLine}
          </div>
          <p style="margin: 0 0 8px; color: #666; font-size: 14px; line-height: 1.6;">
            You have an outstanding balance with <strong>${orgName}</strong>. Please make your payment at your earliest convenience.
          </p>
          ${paymentLinksHtml}
          <p style="margin: 24px 0 0; color: #bbb; font-size: 12px;">
            Sent via Ledgly on behalf of ${orgName}
          </p>
          ${this.unsubscribeFooter(email)}
        `),
      });
    } catch (error) {
      this.logger.error('Failed to send overdue reminder', error);
    }
  }

  async sendWeeklyDigest(
    email: string,
    orgName: string,
    stats: {
      paymentsCount: number;
      paymentsTotalCents: number;
      chargesCreated: number;
      expensesRecorded: number;
      newMembers: number;
      outstandingCents: number;
      overdueCount: number;
    },
    dashboardUrl: string,
  ): Promise<void> {
    const from = this.configService.get<string>('EMAIL_FROM', 'Ledgly <noreply@ledgly.app>');

    if (!this.resend) {
      this.logger.warn(`Resend not configured — skipping weekly digest to ${email}`);
      return;
    }

    const fmt = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    const weekSummaryParts: string[] = [];
    if (stats.paymentsCount > 0)
      weekSummaryParts.push(`${stats.paymentsCount} payment${stats.paymentsCount !== 1 ? 's' : ''} (${fmt(stats.paymentsTotalCents)})`);
    if (stats.chargesCreated > 0)
      weekSummaryParts.push(`${stats.chargesCreated} new charge${stats.chargesCreated !== 1 ? 's' : ''}`);
    if (stats.expensesRecorded > 0)
      weekSummaryParts.push(`${stats.expensesRecorded} expense${stats.expensesRecorded !== 1 ? 's' : ''}`);
    if (stats.newMembers > 0)
      weekSummaryParts.push(`${stats.newMembers} new member${stats.newMembers !== 1 ? 's' : ''}`);

    const weekLine = weekSummaryParts.length > 0
      ? `This week: ${weekSummaryParts.join(', ')}`
      : 'No activity this week';

    const highlights: string[] = [];
    if (stats.overdueCount > 0)
      highlights.push(`${stats.overdueCount} charge${stats.overdueCount !== 1 ? 's' : ''} overdue`);
    if (stats.outstandingCents > 0)
      highlights.push(`${fmt(stats.outstandingCents)} outstanding`);

    const highlightsHtml = highlights.length > 0
      ? `<div style="background: #FEF9EE; border-left: 4px solid #F59E0B; border-radius: 8px; padding: 12px 16px; margin: 0 0 24px;">
            ${highlights.map((h) => `<p style="margin: 0; color: #92400E; font-size: 14px; line-height: 1.6;">${h}</p>`).join('')}
          </div>`
      : '';

    try {
      const unsub = this.unsubscribeUrl(email);
      await this.resend.emails.send({
        from,
        to: email,
        subject: `Weekly Summary — ${orgName}`,
        headers: {
          'List-Unsubscribe': `<${unsub}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        html: this.wrapTemplate(`
          <h1 style="margin: 0 0 8px; font-size: 22px; color: #111;">Weekly Summary</h1>
          <p style="margin: 0 0 24px; color: #999; font-size: 14px;">${orgName}</p>
          <div style="background: #F9FAFB; border-radius: 8px; padding: 16px 20px; margin: 0 0 20px;">
            <p style="margin: 0; color: #333; font-size: 15px; line-height: 1.6;">${weekLine}</p>
          </div>
          ${highlightsHtml}
          <a href="${dashboardUrl}" style="display: inline-block; background: #111; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
            View Dashboard
          </a>
          <p style="margin: 24px 0 0; color: #bbb; font-size: 12px;">
            Sent every Monday by Ledgly
          </p>
          ${this.unsubscribeFooter(email)}
        `),
      });
    } catch (error) {
      this.logger.error(`Failed to send weekly digest to ${email}`, error);
    }
  }

  async sendBalanceSummary(
    email: string,
    memberName: string,
    orgName: string,
    balanceCents: number,
    charges: Array<{ title: string; amountCents: number; dueDate: string | null }>,
    portalUrl: string,
    paymentHandles?: Record<string, string>,
    enabledSources?: string[],
  ): Promise<void> {
    const from = this.configService.get<string>('EMAIL_FROM', 'Ledgly <noreply@ledgly.app>');

    if (!this.resend) {
      this.logger.warn(`Resend not configured — skipping balance summary to ${email}`);
      return;
    }

    const greeting = memberName ? `Hi ${memberName.split(' ')[0]},` : 'Hi,';
    const amount = (balanceCents / 100).toFixed(2);

    const chargeListHtml = charges.slice(0, 5).map((c) => {
      const amt = (c.amountCents / 100).toFixed(2);
      const due = c.dueDate ? ` — due ${c.dueDate}` : '';
      return `<li style="margin: 4px 0; color: #333; font-size: 14px;">${c.title}: <strong>$${amt}</strong>${due}</li>`;
    }).join('');
    const moreCount = charges.length > 5 ? charges.length - 5 : 0;

    let paymentLinksHtml = '';
    if (paymentHandles && enabledSources) {
      const links: string[] = [];
      const buttonStyle = 'display: inline-block; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; margin: 4px;';
      if (enabledSources.includes('venmo') && paymentHandles.venmo) {
        const handle = paymentHandles.venmo.replace(/^@/, '');
        links.push(`<a href="https://account.venmo.com/pay?recipients=${encodeURIComponent(handle)}&amount=${amount}" style="${buttonStyle} background: #008CFF; color: white;">Pay on Venmo</a>`);
      }
      if (enabledSources.includes('cashapp') && paymentHandles.cashapp) {
        const handle = paymentHandles.cashapp.replace(/^\$/, '');
        links.push(`<a href="https://cash.app/$${handle}/${amount}" style="${buttonStyle} background: #00D632; color: white;">Pay on Cash App</a>`);
      }
      if (enabledSources.includes('paypal') && paymentHandles.paypal) {
        links.push(`<a href="https://paypal.me/${paymentHandles.paypal}/${amount}" style="${buttonStyle} background: #0070BA; color: white;">Pay on PayPal</a>`);
      }
      if (enabledSources.includes('zelle') && paymentHandles.zelle) {
        links.push(`<p style="margin: 8px 0 0; font-size: 13px; color: #666;">Pay via Zelle to: <strong>${paymentHandles.zelle}</strong></p>`);
      }
      if (links.length > 0) {
        paymentLinksHtml = `
          <div style="margin: 24px 0 0; padding: 20px 0 0; border-top: 1px solid #eee;">
            <p style="margin: 0 0 12px; font-size: 13px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;">Pay now</p>
            <div style="text-align: center;">${links.join('\n')}</div>
          </div>`;
      }
    }

    try {
      const unsub = this.unsubscribeUrl(email);
      await this.resend.emails.send({
        from,
        to: email,
        subject: `${orgName}: You owe $${amount}`,
        headers: {
          'List-Unsubscribe': `<${unsub}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        html: this.wrapTemplate(`
          <p style="margin: 0 0 20px; color: #666; font-size: 15px; line-height: 1.5;">${greeting}</p>
          <div style="background: #FEF9EE; border-left: 4px solid #F59E0B; border-radius: 8px; padding: 16px 20px; margin: 0 0 20px;">
            <p style="margin: 0 0 4px; font-size: 13px; color: #92400E; text-transform: uppercase; letter-spacing: 0.5px;">Outstanding balance</p>
            <p style="margin: 0; font-size: 28px; font-weight: 700; color: #111;">$${amount}</p>
          </div>
          <p style="margin: 0 0 8px; color: #666; font-size: 14px;">Open charges with <strong>${orgName}</strong>:</p>
          <ul style="margin: 0 0 4px; padding-left: 20px;">${chargeListHtml}</ul>
          ${moreCount > 0 ? `<p style="margin: 0 0 16px; color: #999; font-size: 13px;">+ ${moreCount} more</p>` : ''}
          <a href="${portalUrl}" style="display: inline-block; background: #111; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
            View My Balance
          </a>
          ${paymentLinksHtml}
          <p style="margin: 24px 0 0; color: #bbb; font-size: 12px;">
            Sent weekly by Ledgly on behalf of ${orgName}
          </p>
          ${this.unsubscribeFooter(email)}
        `),
      });
    } catch (error) {
      this.logger.error(`Failed to send balance summary to ${email}`, error);
    }
  }

  async sendIntegrationAlert(
    email: string,
    orgName: string,
    integration: string,
    detail: string,
    settingsUrl: string,
  ): Promise<void> {
    const from = this.configService.get<string>('EMAIL_FROM', 'Ledgly <noreply@ledgly.app>');
    if (!this.resend) return;

    try {
      await this.resend.emails.send({
        from,
        to: email,
        subject: `${orgName}: ${integration} connection needs attention`,
        html: this.wrapTemplate(`
          <h1 style="margin: 0 0 24px; font-size: 24px; color: #111;">Integration Alert</h1>
          <div style="background: #FEF2F2; border-left: 4px solid #EF4444; border-radius: 8px; padding: 16px 20px; margin: 0 0 20px;">
            <p style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: #111;">${integration}</p>
            <p style="margin: 0; color: #666; font-size: 14px;">${detail}</p>
          </div>
          <a href="${settingsUrl}" style="display: inline-block; background: #111; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
            Go to Settings
          </a>
          <p style="margin: 24px 0 0; color: #bbb; font-size: 12px;">
            Sent by Ledgly on behalf of ${orgName}
          </p>
        `),
      });
    } catch (error) {
      this.logger.error('Failed to send integration alert', error);
    }
  }

  private unsubscribeUrl(email: string): string {
    const webUrl = this.configService.get<string>('WEB_URL');
    return `${webUrl}/unsubscribe?email=${encodeURIComponent(email)}&type=notifications`;
  }

  private unsubscribeFooter(email: string): string {
    const url = this.unsubscribeUrl(email);
    return `<p style="margin: 24px 0 0; color: #bbb; font-size: 11px; text-align: center;"><a href="${url}" style="color: #bbb;">Unsubscribe</a> from these notifications</p>`;
  }

  private wrapTemplate(content: string): string {
    return `<!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background-color: #f5f5f5;">
          <div style="max-width: 480px; margin: 0 auto; background: white; padding: 32px; border-radius: 8px;">
            ${content}
          </div>
        </body>
      </html>`;
  }
}
