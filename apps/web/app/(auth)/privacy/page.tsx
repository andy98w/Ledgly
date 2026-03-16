export const metadata = { title: 'Privacy Policy — Ledgly' };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-2xl mx-auto prose prose-sm dark:prose-invert">
        <h1>Privacy Policy</h1>
        <p className="text-muted-foreground">Last updated: March 16, 2026</p>

        <h2>Overview</h2>
        <p>
          Ledgly (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is a financial management platform for student organizations,
          fraternities, clubs, and similar groups. This policy describes how we collect, use, and protect your information.
        </p>

        <h2>Information We Collect</h2>
        <h3>Account Information</h3>
        <p>When you create an account, we collect your name, email address, and password (stored securely using bcrypt hashing).</p>

        <h3>Organization Data</h3>
        <p>
          When you use Ledgly, we store financial data you create including member records, charges, payments, and expenses.
          This data belongs to your organization and is only accessible to authorized members.
        </p>

        <h3>Gmail Integration (Optional)</h3>
        <p>
          If you connect Gmail, we access payment notification emails from Venmo, Zelle, Cash App, and PayPal to automatically
          import payment records. We only read emails from these specific senders — we do not read, store, or access any other
          emails in your inbox. OAuth tokens are stored securely and can be revoked at any time from Settings.
        </p>

        <h3>Bank Connection via Plaid (Optional)</h3>
        <p>
          If you connect a bank account, we use Plaid Inc. to securely access your transaction data. We only read transaction
          history to identify peer-to-peer payment transfers (Venmo, Zelle, Cash App, PayPal). We never initiate transactions,
          move funds, or access your bank credentials. Plaid&apos;s own privacy policy governs how they handle your banking
          credentials: <a href="https://plaid.com/legal/#end-user-privacy-policy" target="_blank" rel="noopener noreferrer">plaid.com/legal</a>.
        </p>

        <h2>How We Use Your Information</h2>
        <ul>
          <li>To provide and maintain the Ledgly service</li>
          <li>To send transactional emails (payment reminders, verification, password resets)</li>
          <li>To automatically import and match payment records from connected services</li>
          <li>To generate financial reports and insights for your organization</li>
        </ul>
        <p>We do not sell your data. We do not use your data for advertising. We do not share your data with third parties except as described below.</p>

        <h2>Third-Party Services</h2>
        <ul>
          <li><strong>Plaid</strong> — Bank account connection and transaction data (optional)</li>
          <li><strong>Google</strong> — Gmail API for payment email import (optional)</li>
          <li><strong>Resend</strong> — Transactional email delivery</li>
          <li><strong>Anthropic</strong> — AI assistant functionality (your prompts and organization context are sent to generate responses)</li>
          <li><strong>Sentry</strong> — Error tracking and monitoring (no personal data)</li>
          <li><strong>Supabase/Railway</strong> — Database and application hosting</li>
        </ul>

        <h2>Data Security</h2>
        <ul>
          <li>All data is encrypted in transit using TLS 1.2+</li>
          <li>Database is encrypted at rest</li>
          <li>Passwords are hashed using bcrypt</li>
          <li>Authentication uses JWT tokens with httpOnly cookies</li>
          <li>Rate limiting protects against brute-force attacks</li>
          <li>Role-based access control limits data visibility</li>
        </ul>

        <h2>Data Retention and Deletion</h2>
        <p>
          We retain your data for as long as your account is active. You can disconnect Gmail or bank connections at any time
          from Settings, which stops future data collection. Organization owners can delete their organization, which removes
          all associated data. To request complete account deletion, contact us at the email below.
        </p>

        <h2>Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li>Access your data (available through the application)</li>
          <li>Export your data (CSV export available)</li>
          <li>Delete your data (contact us or delete your organization)</li>
          <li>Revoke third-party access (disconnect Gmail/bank from Settings)</li>
        </ul>

        <h2>Children&apos;s Privacy</h2>
        <p>Ledgly is not intended for use by individuals under the age of 13.</p>

        <h2>Changes to This Policy</h2>
        <p>We may update this policy from time to time. We will notify users of material changes via email or in-app notification.</p>

        <h2>Contact</h2>
        <p>For privacy questions or data deletion requests, contact: <a href="mailto:awseer09@gmail.com">awseer09@gmail.com</a></p>
      </div>
    </div>
  );
}
