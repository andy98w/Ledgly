'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Receipt,
  RefreshCw,
  Mail,
  Sparkles,
  TrendingDown,
  History,
  Check,
  DollarSign,
  Zap,
  Clock,
  CreditCard,
  Smartphone,
  Bot,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollReveal } from '@/components/ui/scroll-reveal';

/* ─── Data ───────────────────────────────────────────────────── */

const howItWorks = [
  {
    step: 1,
    title: 'Create Your Org',
    description:
      'Sign up free, name your org, and invite members with a join code.',
    color: 'from-primary to-violet-500',
  },
  {
    step: 2,
    title: 'Connect Gmail',
    description:
      'Link your Gmail — we auto-detect payment notifications from Venmo, Zelle, CashApp & PayPal.',
    color: 'from-violet-500 to-cyan-400',
  },
  {
    step: 3,
    title: 'Track Everything',
    description:
      'Payments auto-match to dues. See who\u2019s paid, who hasn\u2019t, and let AI handle follow-ups.',
    color: 'from-cyan-400 to-emerald-400',
  },
];

const featureCards = [
  {
    icon: Receipt,
    title: 'Know Who Owes What — Instantly',
    description:
      'Create charges for dues, events, or fines. One glance shows every balance across your whole org.',
    iconBg: 'bg-amber-500/10',
    iconText: 'text-amber-500',
    hoverBorder: 'hover:border-amber-500/30',
  },
  {
    icon: RefreshCw,
    title: 'Payments Match Themselves',
    description:
      'Incoming payments auto-match against unpaid charges. No manual bookkeeping ever again.',
    iconBg: 'bg-emerald-500/10',
    iconText: 'text-emerald-500',
    hoverBorder: 'hover:border-emerald-500/30',
  },
  {
    icon: Mail,
    title: 'Keep Using Venmo & Zelle',
    description:
      'Members pay how they already pay. We read the receipts from your Gmail — no new app for anyone.',
    iconBg: 'bg-cyan-500/10',
    iconText: 'text-cyan-500',
    hoverBorder: 'hover:border-cyan-500/30',
  },
  {
    icon: Sparkles,
    title: 'Just Tell AI What You Need',
    description:
      'Add members, create charges, record payments — type what you want in plain English and it\u2019s done.',
    iconBg: 'bg-primary/10',
    iconText: 'text-primary',
    hoverBorder: 'hover:border-primary/30',
  },
  {
    icon: TrendingDown,
    title: 'Track Where Money Goes',
    description:
      'Categorize expenses by vendor and type. Gmail auto-detects outgoing payments too.',
    iconBg: 'bg-rose-500/10',
    iconText: 'text-rose-500',
    hoverBorder: 'hover:border-rose-500/30',
  },
  {
    icon: History,
    title: 'Every Action Logged & Undoable',
    description:
      'Full audit trail of who did what and when. Undo or redo any change with one click.',
    iconBg: 'bg-violet-500/10',
    iconText: 'text-violet-500',
    hoverBorder: 'hover:border-violet-500/30',
  },
];

const showcaseTabs = [
  {
    label: 'Dashboard',
    slug: 'dashboard',
    description:
      'Your full financial picture at a glance — unpaid dues, collected payments, overdue balances, and quick actions to manage everything.',
  },
  {
    label: 'Members & Charges',
    slug: 'members',
    description:
      'See every member\u2019s payment history and balance. Create charges for dues, events, or fines and assign them instantly.',
  },
  {
    label: 'Gmail Inbox',
    slug: 'inbox',
    description:
      'Venmo, Zelle, CashApp, and PayPal notifications auto-imported. Payments parsed and matched — just review and confirm.',
  },
  {
    label: 'AI Agent',
    slug: null,
    description:
      'Manage your org in plain English. Add members, create charges, run reports — all from a single conversation.',
  },
  {
    label: 'Audit Log',
    slug: 'audit-log',
    description:
      'Every action tracked with full context. Undo and redo any change with one click for complete transparency.',
  },
];

const whyLedgly = [
  {
    icon: DollarSign,
    title: 'No fees — ever',
    description: 'Crowded charges 2.99% per transaction. Ledgly is 100% free.',
    iconBg: 'bg-emerald-500/10',
    iconText: 'text-emerald-500',
  },
  {
    icon: Smartphone,
    title: 'Works with your existing apps',
    description:
      'Members keep paying through Venmo, Zelle, or CashApp. No one downloads anything new.',
    iconBg: 'bg-cyan-500/10',
    iconText: 'text-cyan-500',
  },
  {
    icon: Bot,
    title: 'AI-powered',
    description:
      'Natural language commands to manage your entire treasury. No competitor offers this.',
    iconBg: 'bg-primary/10',
    iconText: 'text-primary',
  },
];

/* ─── Component ──────────────────────────────────────────────── */

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const currentTab = showcaseTabs[activeTab];

  return (
    <div className="min-h-dvh bg-background text-foreground relative overflow-x-hidden">
      {/* Fixed background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-primary/5 via-violet-500/3 to-cyan-500/5 pointer-events-none z-0" />

      {/* Fixed subtle grid */}
      <div
        className="fixed inset-0 opacity-[0.02] pointer-events-none z-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke='rgb(255 255 255 / 0.5)'%3e%3cpath d='M0 .5H31.5V32'/%3e%3c/svg%3e")`,
        }}
      />

      {/* ── Navbar ────────────────────────────────────────────── */}
      <header
        className={cn(
          'fixed top-0 inset-x-0 z-50 transition-all duration-300',
          scrolled
            ? 'bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-layered-sm'
            : 'bg-transparent border-b border-transparent',
        )}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between h-16 px-6">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="Ledgly" width={36} height={36} />
            <span className="font-bold text-xl tracking-tight">Ledgly</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-3">
            <a
              href="#how-it-works"
              className="hidden sm:inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              How It Works
            </a>
            <a
              href="#features"
              className="hidden sm:inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Features
            </a>
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Log In
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-primary via-violet-500 to-cyan-400 text-primary-foreground hover:opacity-90 transition-all duration-150 shadow-layered-sm active:scale-[0.98]"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-16 md:pt-40 md:pb-24 px-6 noise-overlay">
        {/* Animated gradient orbs */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 via-blue-400/15 to-purple-500/10 blur-[120px] animate-float" />
          <div className="absolute inset-8 rounded-full bg-gradient-to-tr from-blue-400/10 via-primary/15 to-cyan-400/10 blur-[100px] animate-gradient-rotate" />
          <div className="absolute inset-4 rounded-full bg-gradient-to-bl from-violet-500/15 via-purple-400/10 to-fuchsia-500/10 blur-[110px] animate-float" style={{ animationDelay: '-3s' }} />
          <div className="absolute inset-12 rounded-full bg-gradient-to-tl from-cyan-400/10 via-teal-400/10 to-emerald-400/5 blur-[100px] animate-gradient-rotate" style={{ animationDelay: '-5s' }} />
        </div>

        <div className="max-w-3xl mx-auto text-center relative z-10">
          {/* Free badge */}
          <div className="animate-reveal-up" style={{ animationDelay: '0ms' }}>
            <span className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium bg-emerald-500/10 text-emerald-500 mb-6">
              <Check className="h-3.5 w-3.5" />
              Free forever — no fees, no credit card
            </span>
          </div>

          <h1 className="text-fluid-5xl font-bold tracking-tight leading-[1.1] animate-reveal-up" style={{ animationDelay: '100ms' }}>
            Stop Chasing Venmo Payments
            <br />
            <span className="bg-gradient-to-r from-primary via-violet-500 to-cyan-400 bg-clip-text text-transparent">
              in a Spreadsheet
            </span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed animate-reveal-up" style={{ animationDelay: '200ms' }}>
            Connect your Gmail. We auto-import Venmo, Zelle, CashApp &amp; PayPal payments and match them to dues — for free.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 animate-reveal-up" style={{ animationDelay: '300ms' }}>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-xl px-8 py-3.5 text-sm font-medium bg-gradient-to-r from-primary via-violet-500 to-cyan-400 text-primary-foreground hover:opacity-90 transition-all duration-150 shadow-layered-lg active:scale-[0.98]"
            >
              Get Started Free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center rounded-xl px-8 py-3.5 text-sm font-medium border border-border/50 bg-secondary/50 text-foreground hover:bg-secondary transition-all duration-150 active:scale-[0.98]"
            >
              See How It Works
            </a>
          </div>
          <p className="mt-6 text-sm text-muted-foreground animate-reveal-up" style={{ animationDelay: '400ms' }}>
            For fraternities, clubs, and student orgs
          </p>
        </div>

        {/* Hero screenshot */}
        <div className="max-w-5xl mx-auto mt-16 relative z-10 animate-reveal-up" style={{ animationDelay: '500ms' }}>
          <div className="rounded-xl border border-border/50 overflow-hidden shadow-layered-lg bg-card/30 backdrop-blur-sm">
            <Image
              src="/screenshots/light/dashboard.png"
              alt="Ledgly dashboard"
              width={1230}
              height={790}
              className="w-full h-auto block dark:hidden"
              priority
            />
            <Image
              src="/screenshots/dark/dashboard.png"
              alt="Ledgly dashboard"
              width={1230}
              height={790}
              className="w-full h-auto hidden dark:block"
              priority
            />
          </div>
        </div>
      </section>

      {/* ── Social Proof Bar ──────────────────────────────────── */}
      <section className="relative py-12 px-6 border-y border-border/30">
        <div className="max-w-4xl mx-auto">
          <ScrollReveal>
            <p className="text-center text-sm text-muted-foreground mb-8">
              Trusted by student organizations across the country
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
              {[
                { icon: DollarSign, label: '100% Free', sublabel: 'No fees, no catches', iconBg: 'bg-emerald-500/10', iconText: 'text-emerald-500' },
                { icon: CreditCard, label: 'Works with Venmo, Zelle, CashApp & PayPal', sublabel: 'Keep your existing apps', iconBg: 'bg-cyan-500/10', iconText: 'text-cyan-500' },
                { icon: Clock, label: 'Setup in under 5 minutes', sublabel: 'From signup to tracking', iconBg: 'bg-violet-500/10', iconText: 'text-violet-500' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 justify-center">
                  <div className={cn('p-2 rounded-lg shrink-0', item.iconBg)}>
                    <item.icon className={cn('h-4 w-4', item.iconText)} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.sublabel}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────── */}
      <section id="how-it-works" className="relative py-32 px-6 scroll-mt-20">
        <div className="max-w-5xl mx-auto">
          <ScrollReveal>
            <h2 className="text-center text-fluid-2xl font-bold tracking-tight mb-16">
              How It Works
            </h2>
          </ScrollReveal>

          <div className="relative grid gap-12 md:gap-0 md:grid-cols-3">
            {/* Connecting line (desktop) */}
            <div className="hidden md:block absolute top-8 left-[16.67%] right-[16.67%] h-0.5 bg-gradient-to-r from-primary via-violet-500 to-cyan-400 opacity-20" />

            {howItWorks.map((item, i) => (
              <ScrollReveal key={item.step} delay={i * 150}>
                <div className="flex flex-col items-center text-center px-6">
                  {/* Numbered circle */}
                  <div className={cn(
                    'relative z-10 w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white bg-gradient-to-br mb-6',
                    item.color,
                  )}>
                    {item.step}
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                    {item.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature Grid ──────────────────────────────────────── */}
      <section id="features" className="relative py-32 px-6 scroll-mt-20">
        <div className="max-w-5xl mx-auto">
          <ScrollReveal>
            <h2 className="text-center text-fluid-2xl font-bold tracking-tight mb-4">
              Everything You Need
            </h2>
            <p className="text-center text-muted-foreground mb-16 max-w-xl mx-auto">
              Stop juggling spreadsheets, Venmo screenshots, and group chats. Ledgly handles it all.
            </p>
          </ScrollReveal>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featureCards.map((feature, i) => (
              <ScrollReveal key={feature.title} delay={i * 80}>
                <div
                  className={cn(
                    'rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-6',
                    'hover:bg-card/80 hover:-translate-y-1 hover:shadow-layered-lg transition-all duration-200 h-full',
                    feature.hoverBorder,
                  )}
                >
                  <div className={cn('p-2.5 rounded-lg w-fit mb-4', feature.iconBg)}>
                    <feature.icon className={cn('h-5 w-5', feature.iconText)} />
                  </div>
                  <h3 className="font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Showcase (tabbed) ─────────────────────────────────── */}
      <section className="relative py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
            <h2 className="text-center text-fluid-2xl font-bold tracking-tight mb-4">
              See It in Action
            </h2>
            <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
              Click through to explore every view.
            </p>
          </ScrollReveal>

          {/* Tabs */}
          <ScrollReveal>
            <div className="flex flex-wrap justify-center gap-2 mb-10">
              {showcaseTabs.map((tab, i) => (
                <button
                  key={tab.label}
                  onClick={() => setActiveTab(i)}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                    activeTab === i
                      ? 'bg-primary text-primary-foreground shadow-layered-sm'
                      : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </ScrollReveal>

          {/* Tab content */}
          <ScrollReveal>
            <div className="flex flex-col md:flex-row items-center gap-8 md:gap-16">
              {/* Screenshot / placeholder */}
              <div className="flex-1 min-w-0 w-full">
                {currentTab.slug ? (
                  <div className="rounded-xl border border-border/50 overflow-hidden shadow-layered-lg">
                    <Image
                      src={`/screenshots/light/${currentTab.slug}.png`}
                      alt={`${currentTab.label} screenshot`}
                      width={1230}
                      height={790}
                      className="w-full h-auto block dark:hidden"
                    />
                    <Image
                      src={`/screenshots/dark/${currentTab.slug}.png`}
                      alt={`${currentTab.label} screenshot`}
                      width={1230}
                      height={790}
                      className="w-full h-auto hidden dark:block"
                    />
                  </div>
                ) : (
                  /* AI Agent placeholder */
                  <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm shadow-layered-lg p-8 md:p-12 flex flex-col items-center justify-center min-h-[320px] md:min-h-[400px]">
                    <div className="p-4 rounded-2xl bg-primary/10 mb-6">
                      <Sparkles className="h-10 w-10 text-primary" />
                    </div>
                    <p className="text-muted-foreground text-sm mb-6 text-center max-w-sm">
                      &quot;Charge all active members $50 for Spring Dues&quot;
                    </p>
                    <div className="flex flex-col gap-3 w-full max-w-xs">
                      <div className="rounded-lg border border-border/50 bg-secondary/30 p-3 text-sm">
                        <span className="font-medium">LedgelyAI</span>
                        <span className="text-muted-foreground ml-2">
                          I&apos;ll create a $50.00 &quot;Spring Dues&quot; charge for 24 active members.
                        </span>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <span className="inline-flex items-center rounded-lg px-4 py-2 text-xs font-medium border border-border/50 bg-secondary/50 text-muted-foreground">
                          Cancel
                        </span>
                        <span className="inline-flex items-center rounded-lg px-4 py-2 text-xs font-medium bg-primary text-primary-foreground">
                          Confirm
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-semibold mb-3">{currentTab.label}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {currentTab.description}
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Why Ledgly ─────────────────────────────────────────── */}
      <section className="relative py-32 px-6">
        <div className="max-w-5xl mx-auto">
          <ScrollReveal>
            <h2 className="text-center text-fluid-2xl font-bold tracking-tight mb-4">
              Why Ledgly
            </h2>
            <p className="text-center text-muted-foreground mb-16 max-w-xl mx-auto">
              Other tools charge fees, force members onto new platforms, or lack modern features. We don&apos;t.
            </p>
          </ScrollReveal>

          <div className="grid gap-6 sm:grid-cols-3">
            {whyLedgly.map((item, i) => (
              <ScrollReveal key={item.title} delay={i * 100}>
                <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-8 text-center hover:bg-card/80 hover:-translate-y-1 hover:shadow-layered-lg transition-all duration-200 h-full">
                  <div className={cn('p-3 rounded-xl w-fit mx-auto mb-5', item.iconBg)}>
                    <item.icon className={cn('h-6 w-6', item.iconText)} />
                  </div>
                  <h3 className="font-semibold mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA + Footer ──────────────────────────────────────── */}
      <section className="relative pb-0 px-6">
        <div className="max-w-3xl mx-auto text-center pb-32">
          <ScrollReveal>
            <h2 className="text-fluid-3xl font-bold tracking-tight mb-4">
              Ready to ditch the spreadsheet?
            </h2>
            <p className="text-muted-foreground mb-8">
              Free forever. Set up in 5 minutes.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-xl px-8 py-3.5 text-sm font-medium bg-gradient-to-r from-primary via-violet-500 to-cyan-400 text-primary-foreground hover:opacity-90 transition-all duration-150 shadow-layered-lg active:scale-[0.98]"
            >
              Get Started Free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </ScrollReveal>
        </div>

        {/* Footer */}
        <footer className="w-full border-t border-border/50 py-8 px-6">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <span>Ledgly &copy; {new Date().getFullYear()}</span>
            <div className="flex items-center gap-6">
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
              <a href="mailto:awseer09@gmail.com" className="hover:text-foreground transition-colors">Contact</a>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}
