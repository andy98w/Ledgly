'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  CreditCard,
  Download,
  FileSpreadsheet,
  Mail,
  Receipt,
  ShieldCheck,
  Users,
} from 'lucide-react';

const steps = [
  { title: 'Set up your group', description: 'Create an organization, invite members, and decide what is due.' },
  { title: 'Bring in the payments', description: 'Connect Gmail or Plaid. Ledgly finds payment notices and matches them to people.' },
  { title: 'Review the ledger', description: 'See what is open, send a reminder, and keep a record everyone can understand.' },
];

const features = [
  { icon: FileSpreadsheet, title: 'A ledger your group can use', description: 'Sort, filter, resize, and edit the same information without passing around a fragile spreadsheet.', tone: 'blue' },
  { icon: Download, title: 'Payment matching', description: 'Venmo, Zelle, Cash App, and PayPal notices can be pulled from Gmail and matched to open charges.', tone: 'green' },
  { icon: Users, title: 'A clear member view', description: 'Members see their balance and payment history in a browser. No second app to install.', tone: 'gold' },
  { icon: Bot, title: 'An assistant for busy treasurers', description: 'Ask who still owes dues or prepare a new charge in plain language, with confirmation before changes.', tone: 'ink' },
  { icon: ShieldCheck, title: 'A record of every change', description: 'Role-based access and an audit trail make handoffs less stressful when the treasurer changes.', tone: 'blue' },
  { icon: CreditCard, title: 'Your existing payment apps', description: 'Keep using the apps people already know. Ledgly tracks the result instead of moving the money.', tone: 'green' },
];

const faqs = [
  { question: 'Does Ledgly move or hold our money?', answer: 'No. Ledgly records charges and payments. Members continue to pay through Venmo, Zelle, Cash App, PayPal, or your connected bank.' },
  { question: 'Do members need an account?', answer: 'Members use a browser portal to see their balance and history. They do not need to install a mobile app.' },
  { question: 'What does Gmail access include?', answer: 'Ledgly reads payment notification messages from supported senders. It does not need access to unrelated personal email.' },
  { question: 'Can we use it for a club or a small team?', answer: 'Yes. Ledgly is designed for groups that collect dues or share expenses: student organizations, clubs, teams, and Greek-letter chapters.' },
];

function LedgerPreview() {
  return (
    <div className="ledger-preview" aria-label="Example Ledgly ledger">
      <div className="ledger-preview-bar"><div className="flex items-center gap-2"><span className="ledger-window-dot" /><span className="ledger-window-dot" /><span className="ledger-window-dot" /></div><span className="ledger-preview-label">Spring dues · 24 members</span><span className="ledger-live"><i /> Up to date</span></div>
      <div className="ledger-preview-head"><div><p className="ledger-kicker">Oak &amp; Pine / 2026</p><h2>Member balances</h2></div><button className="ledger-action" type="button">+ New charge</button></div>
      <div className="ledger-table-wrap"><table className="ledger-table"><thead><tr><th>Member</th><th>Charge</th><th>Paid</th><th>Status</th></tr></thead><tbody>
        <tr><td><strong>Jordan Lee</strong><small>jordan@example.com</small></td><td>$85.00</td><td>$85.00</td><td><span className="ledger-status paid">Paid</span></td></tr>
        <tr><td><strong>Maya Chen</strong><small>maya@example.com</small></td><td>$85.00</td><td>$40.00</td><td><span className="ledger-status partial">Partial</span></td></tr>
        <tr><td><strong>Sam Rivera</strong><small>sam@example.com</small></td><td>$85.00</td><td>$0.00</td><td><span className="ledger-status open">Open</span></td></tr>
      </tbody></table></div>
      <div className="ledger-preview-foot"><span><Receipt className="h-4 w-4" /> 21 paid or partial</span><span>$1,275 collected</span></div>
    </div>
  );
}

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="ledger-page min-h-dvh bg-background text-foreground">
      <header className="ledger-nav"><div className="ledger-container flex h-[72px] items-center justify-between">
        <Link href="/" className="flex items-center gap-3" aria-label="Ledgly home"><Image src="/logo.png" alt="" width={34} height={34} className="ledger-logo" /><span className="text-lg font-semibold tracking-[-0.04em]">Ledgly</span></Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex" aria-label="Main navigation"><a href="#how-it-works" className="hover:text-foreground">How it works</a><a href="#features" className="hover:text-foreground">Features</a><a href="#questions" className="hover:text-foreground">Questions</a></nav>
        <div className="flex items-center gap-2"><Link href="/login" className="ledger-nav-link">Sign in</Link><Link href="/register" className="ledger-button ledger-button-primary">Create an account <ArrowRight className="h-4 w-4" /></Link></div>
      </div></header>

      <main>
        <section className="ledger-hero"><div className="ledger-container ledger-hero-grid"><div className="ledger-hero-copy"><p className="ledger-kicker"><span className="ledger-kicker-rule" /> Shared finances, kept clear</p><h1>Know what your group owes.</h1><p className="ledger-hero-lede">Ledgly gives clubs, teams, and student organizations one place to track dues, match payments, and hand off the books without a spreadsheet maze.</p><div className="flex flex-wrap items-center gap-3"><Link href="/register" className="ledger-button ledger-button-primary ledger-button-large">Start with your group <ArrowRight className="h-4 w-4" /></Link><a href="#how-it-works" className="ledger-button ledger-button-quiet ledger-button-large">See how it works</a></div><p className="ledger-hero-note"><Check className="h-4 w-4" /> Free to start · no transaction fees</p></div><div className="ledger-hero-art"><LedgerPreview /></div></div></section>

        <section className="ledger-proof" aria-label="Ledgly benefits"><div className="ledger-container grid gap-6 md:grid-cols-3"><div><strong>One shared ledger</strong><span>Charges, payments, and balances in one view.</span></div><div><strong>Less manual matching</strong><span>Bring in payment notices from the tools you already use.</span></div><div><strong>Easy handoffs</strong><span>Audit history that survives the next treasurer.</span></div></div></section>

        <section id="how-it-works" className="ledger-section ledger-container scroll-mt-24"><div className="ledger-section-heading"><p className="ledger-kicker">A simpler weekly routine</p><h2>From payment notice to a clean ledger.</h2><p>Ledgly keeps the busywork in one place so your group can spend its time on the work that matters.</p></div><div className="grid gap-5 md:grid-cols-3">{steps.map((step, index) => <article key={step.title} className="ledger-step"><span className="ledger-step-number">0{index + 1}</span><h3>{step.title}</h3><p>{step.description}</p></article>)}</div></section>

        <section id="features" className="ledger-section ledger-section-muted scroll-mt-24"><div className="ledger-container"><div className="ledger-section-heading"><p className="ledger-kicker">What is included</p><h2>The practical parts of running a group.</h2><p>Useful tools for the person who has to reconcile payments on a Sunday night.</p></div><div className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">{features.map((feature) => { const Icon = feature.icon; return <article key={feature.title} className={`ledger-feature ledger-feature-${feature.tone}`}><Icon className="h-5 w-5" /><h3>{feature.title}</h3><p>{feature.description}</p></article>; })}</div></div></section>

        <section className="ledger-section ledger-container"><div className="ledger-split-callout"><div><p className="ledger-kicker">Keep your stack</p><h2>Ledgly tracks the money. Your members keep their apps.</h2><p>Connect Gmail for payment notices, Plaid for bank activity, and the chat tools your group already checks.</p></div><div className="ledger-integrations"><span>Venmo</span><span>Zelle</span><span>Cash App</span><span>PayPal</span><span>Gmail</span><span>Plaid</span><span>GroupMe</span><span>Discord</span><span>Slack</span></div></div></section>

        <section id="questions" className="ledger-section ledger-section-muted scroll-mt-24"><div className="ledger-container ledger-faq"><div className="ledger-section-heading"><p className="ledger-kicker">Questions</p><h2>Before you bring over the spreadsheet.</h2></div><div className="ledger-faq-list">{faqs.map((faq, index) => <div key={faq.question} className="ledger-faq-item"><button type="button" onClick={() => setOpenFaq(openFaq === index ? null : index)} aria-expanded={openFaq === index}><span>{faq.question}</span><ChevronDown className={`h-4 w-4 transition-transform ${openFaq === index ? 'rotate-180' : ''}`} /></button>{openFaq === index && <p>{faq.answer}</p>}</div>)}</div></div></section>

        <section className="ledger-final ledger-container"><div><p className="ledger-kicker">Ready when you are</p><h2>Give your group a ledger it can actually keep up with.</h2><p>Start free and invite the people who need to see it.</p></div><Link href="/register" className="ledger-button ledger-button-primary ledger-button-large">Create an account <ArrowRight className="h-4 w-4" /></Link></section>
      </main>

      <footer className="ledger-footer"><div className="ledger-container flex flex-col gap-4 py-7 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} Ledgly</span><div className="flex gap-5"><Link href="/privacy" className="hover:text-foreground">Privacy</Link><Link href="/terms" className="hover:text-foreground">Terms</Link><a href="mailto:awseer09@gmail.com" className="hover:text-foreground"><Mail className="mr-1 inline h-3.5 w-3.5" />Contact</a></div></div></footer>
    </div>
  );
}
