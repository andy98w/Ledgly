import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Terms of Service - Ledgly',
};

export default function TermsPage() {
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

        <h1 className="text-3xl font-bold tracking-tight mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-12">Last updated: March 4, 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground">
              By accessing or using Ledgly, you agree to be bound by these Terms of Service. If you do not agree, do not use the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
            <p className="text-muted-foreground">
              Ledgly is a financial management platform for organizations. It allows users to track membership dues, record payments, manage expenses, and import payment notifications from email. Ledgly is a record-keeping tool and does not process financial transactions directly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Account Registration</h2>
            <p className="text-muted-foreground">
              You must provide accurate information when creating an account. You are responsible for maintaining the security of your account credentials. You must be at least 13 years old to use Ledgly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Acceptable Use</h2>
            <p className="text-muted-foreground">You agree not to:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Use Ledgly for any unlawful purpose</li>
              <li>Attempt to gain unauthorized access to other accounts or systems</li>
              <li>Upload malicious content or interfere with the platform</li>
              <li>Use automated tools to scrape or extract data</li>
              <li>Misrepresent your identity or affiliation</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Organization Data</h2>
            <p className="text-muted-foreground">
              Organization administrators are responsible for the accuracy of data entered into Ledgly, including member information and financial records. Ledgly does not verify the accuracy of user-entered data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Gmail Integration</h2>
            <p className="text-muted-foreground">
              The Gmail integration feature is optional. By connecting your Gmail account, you authorize Ledgly to access emails from supported payment services in read-only mode for the purpose of importing payment data. You can disconnect Gmail access at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Intellectual Property</h2>
            <p className="text-muted-foreground">
              The Ledgly platform, including its design, code, and branding, is owned by Ledgly. You retain ownership of all data you enter into the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Limitation of Liability</h2>
            <p className="text-muted-foreground">
              Ledgly is provided &ldquo;as is&rdquo; without warranties of any kind. We are not liable for any indirect, incidental, or consequential damages arising from your use of the platform. Ledgly is a record-keeping tool and should not be relied upon as the sole source of financial records.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Termination</h2>
            <p className="text-muted-foreground">
              We may suspend or terminate your access to Ledgly at any time for violation of these terms. You may delete your account at any time. Upon termination, your data will be permanently deleted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Changes to Terms</h2>
            <p className="text-muted-foreground">
              We may update these terms from time to time. Changes will be posted on this page with an updated date. Continued use of Ledgly after changes constitutes acceptance of the revised terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Contact</h2>
            <p className="text-muted-foreground">
              Questions about these terms? Contact us at{' '}
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
