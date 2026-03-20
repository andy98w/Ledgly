export const metadata = { title: 'Terms of Service — Ledgly' };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
          <p className="text-sm text-muted-foreground mt-2">Last updated: March 20, 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Acceptance of Terms</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            By accessing or using Ledgly (&quot;the Service&quot;), you agree to be bound by these Terms of Service.
            If you do not agree to these terms, do not use the Service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Description of Service</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Ledgly is a free financial management platform designed for student organizations, fraternities,
            sororities, clubs, and similar groups. The Service helps track dues, payments, and shared expenses.
            Ledgly does not process, hold, or transfer funds.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Account Responsibility</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You are responsible for maintaining the confidentiality of your account credentials and for all
            activity that occurs under your account. You must notify us immediately of any unauthorized use.
            You must be at least 13 years old to create an account.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Acceptable Use</h2>
          <p className="text-sm text-muted-foreground">You agree not to:</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            <li>Use the Service for any unlawful purpose or to facilitate illegal activity</li>
            <li>Attempt to gain unauthorized access to other accounts or systems</li>
            <li>Interfere with or disrupt the Service or its infrastructure</li>
            <li>Upload malicious code, spam, or harmful content</li>
            <li>Impersonate another person or entity</li>
            <li>Use the Service to process or transfer money</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Data Ownership</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You retain ownership of all data you create or upload to Ledgly, including member records, charges,
            payments, and expenses. We do not claim any intellectual property rights over your content.
            You may export or delete your data at any time.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Service Availability</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We strive to keep Ledgly available at all times, but we do not guarantee uninterrupted access.
            The Service may be temporarily unavailable for maintenance, updates, or due to circumstances
            beyond our control.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Third-Party Integrations</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The Service integrates with third-party providers including Google (Gmail API), Plaid, and others.
            Your use of these integrations is subject to the respective third-party terms of service.
            We are not responsible for the availability or performance of third-party services.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Limitation of Liability</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Ledgly is provided &quot;as is&quot; without warranties of any kind. To the fullest
            extent permitted by law, Ledgly shall not be liable for any indirect, incidental, special,
            consequential, or punitive damages arising from your use of the Service.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Ledgly is a tracking tool only. We are not responsible for any financial discrepancies, missed
            payments, or disputes between organization members.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Termination</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We may suspend or terminate your account at any time for violation of these terms.
            You may delete your account at any time through the application or by contacting us.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Changes to Terms</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We may update these terms from time to time. Continued use of the Service after changes constitutes acceptance.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            For questions about these terms, contact: <a href="mailto:awseer09@gmail.com" className="text-primary hover:underline">awseer09@gmail.com</a>
          </p>
        </section>
      </div>
    </div>
  );
}
