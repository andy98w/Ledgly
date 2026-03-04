import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy - Ledgly',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <h1 className="text-3xl font-bold tracking-tight mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-12">Last updated: March 4, 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Information We Collect</h2>
            <p className="text-muted-foreground">When you use Ledgly, we collect information you provide directly:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Account information: name, email address, and password</li>
              <li>Organization data: organization name, member names, and financial records you enter</li>
              <li>Payment data: dues, charges, and payment amounts managed through the platform</li>
              <li>Gmail data: if you connect Gmail for payment import, we access email metadata from supported payment services (Venmo, Zelle, Cash App, PayPal) in read-only mode</li>
            </ul>
            <p className="text-muted-foreground mt-3">We also collect automatically:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>IP address, browser type, and device information</li>
              <li>Pages visited and usage patterns</li>
              <li>Cookies for authentication and preferences</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. How We Use Your Information</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Provide and maintain the Ledgly platform</li>
              <li>Process and display financial records for your organization</li>
              <li>Send transactional emails (verification, password reset, payment reminders)</li>
              <li>Import and parse payment notifications from connected email accounts</li>
              <li>Improve the platform and fix issues</li>
              <li>Prevent fraud and ensure security</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Gmail Data Usage</h2>
            <p className="text-muted-foreground">
              If you connect your Gmail account, Ledgly requests read-only access to your Gmail inbox. We only access emails from supported payment services (Venmo, Zelle, Cash App, PayPal) to extract payment information. We do not read, store, or process any other emails. Gmail access can be revoked at any time from your organization settings or from your Google Account permissions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Data Sharing</h2>
            <p className="text-muted-foreground">
              We do not sell, trade, or rent your personal information. We may share data with:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Service providers who help operate the platform (hosting, email delivery) under confidentiality agreements</li>
              <li>Law enforcement when required by law</li>
              <li>Other members of your organization, limited to data relevant to that organization</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Data Security</h2>
            <p className="text-muted-foreground">
              We protect your data with industry-standard measures including encrypted connections (HTTPS), hashed passwords, HTTP security headers, and role-based access controls. No method of transmission over the internet is 100% secure, but we take reasonable steps to protect your information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Data Retention</h2>
            <p className="text-muted-foreground">
              We retain your data for as long as your account is active. If you delete your account or organization, associated data is permanently removed. Audit logs are retained for accountability purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Your Rights</h2>
            <p className="text-muted-foreground">Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Access your personal information</li>
              <li>Correct inaccurate data</li>
              <li>Delete your personal information</li>
              <li>Export your data</li>
              <li>Withdraw consent for optional features (e.g., Gmail integration)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Children</h2>
            <p className="text-muted-foreground">
              Ledgly is not intended for children under 13. We do not knowingly collect information from children under 13. If we become aware of such data, we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this policy from time to time. Changes will be posted on this page with an updated date. Continued use of Ledgly after changes constitutes acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Contact</h2>
            <p className="text-muted-foreground">
              Questions about this privacy policy? Contact us at{' '}
              <a href="mailto:awseer09@gmail.com" className="text-primary hover:underline">
                awseer09@gmail.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
