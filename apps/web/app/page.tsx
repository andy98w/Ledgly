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
  Shield,
  Lock,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollReveal } from '@/components/ui/scroll-reveal';

/* ─── Data ───────────────────────────────────────────────────── */

const howItWorks = [
  {
    step: 1,
    title: 'Create & Invite',
    description:
      'Set up your organization and share your join code. Members request access — you approve them in one click.',
    color: 'from-primary to-violet-500',
  },
  {
    step: 2,
    title: 'Connect Gmail',
    description:
      'Auto-import payment notifications from Venmo, Zelle, CashApp, and PayPal. Outgoing expenses are detected too.',
    color: 'from-violet-500 to-cyan-400',
  },
  {
    step: 3,
    title: 'Sit Back & Track',
    description:
      'Payments reconcile automatically against outstanding charges. Your books stay balanced without lifting a finger.',
    color: 'from-cyan-400 to-emerald-400',
  },
];

const featureCards = [
  {
    icon: Receipt,
    title: 'Track Dues & Charges',
    description:
      'Create charges for dues, events, fees, or fines. See who owes what at a glance.',
    iconBg: 'bg-amber-500/10',
    iconText: 'text-amber-500',
    hoverBorder: 'hover:border-amber-500/30',
  },
  {
    icon: RefreshCw,
    title: 'Auto-Reconcile Payments',
    description:
      'Payments are automatically matched to outstanding charges — no manual bookkeeping.',
    iconBg: 'bg-emerald-500/10',
    iconText: 'text-emerald-500',
    hoverBorder: 'hover:border-emerald-500/30',
  },
  {
    icon: Mail,
    title: 'Gmail Import',
    description:
      'Connect Gmail to auto-import Venmo, Zelle, CashApp, and PayPal notifications.',
    iconBg: 'bg-cyan-500/10',
    iconText: 'text-cyan-500',
    hoverBorder: 'hover:border-cyan-500/30',
  },
  {
    icon: Sparkles,
    title: 'AI Financial Assistant',
    description:
      'Manage your org with natural language. Add members, create charges, and record payments — just ask.',
    iconBg: 'bg-primary/10',
    iconText: 'text-primary',
    hoverBorder: 'hover:border-primary/30',
  },
  {
    icon: TrendingDown,
    title: 'Expense Tracking',
    description:
      'Track outgoing money by category and vendor. Gmail auto-detects outgoing payment notifications.',
    iconBg: 'bg-rose-500/10',
    iconText: 'text-rose-500',
    hoverBorder: 'hover:border-rose-500/30',
  },
  {
    icon: History,
    title: 'Full Audit Trail',
    description:
      'Every action is tracked — who did what and when. Undo or redo any change with one click.',
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
      'Your financial overview at a glance — outstanding dues, collected payments, member count, and overdue balances. Quick actions let you add members, create charges, or record payments instantly.',
  },
  {
    label: 'Members & Charges',
    slug: 'members',
    description:
      'Manage your full roster with payment history, outstanding balances, and contact info. Create charges for dues, events, or fines and assign them to one or all members at once.',
  },
  {
    label: 'Gmail Inbox',
    slug: 'inbox',
    description:
      'Connect your Gmail to auto-import Venmo, Zelle, CashApp, and PayPal notifications. Payments are parsed and matched to members automatically — just review and confirm.',
  },
  {
    label: 'AI Agent',
    slug: null, // placeholder — no screenshot yet
    description:
      'Chat with LedgelyAI to manage your organization using natural language. Add members, create charges, record payments, run reports — all from a single conversation.',
  },
  {
    label: 'Audit Log',
    slug: 'audit-log',
    description:
      'Every action is tracked — who created a charge, who recorded a payment, who made changes. Undo and redo any action with one click for full transparency.',
  },
];

const trustIndicators = [
  { icon: History, label: 'Every action logged & undoable', iconColor: 'text-amber-500', iconBg: 'bg-amber-500/10' },
  { icon: Lock, label: 'Bank-grade encryption', iconColor: 'text-emerald-500', iconBg: 'bg-emerald-500/10' },
  { icon: Shield, label: 'Role-based access control', iconColor: 'text-violet-500', iconBg: 'bg-violet-500/10' },
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
          <div className="flex items-center gap-3">
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
      <section className="min-h-dvh relative flex items-center justify-center px-6 noise-overlay">
        {/* Animated gradient orbs */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 via-blue-400/15 to-purple-500/10 blur-[120px] animate-float" />
          <div className="absolute inset-8 rounded-full bg-gradient-to-tr from-blue-400/10 via-primary/15 to-cyan-400/10 blur-[100px] animate-gradient-rotate" />
          <div className="absolute inset-4 rounded-full bg-gradient-to-bl from-violet-500/15 via-purple-400/10 to-fuchsia-500/10 blur-[110px] animate-float" style={{ animationDelay: '-3s' }} />
          <div className="absolute inset-12 rounded-full bg-gradient-to-tl from-cyan-400/10 via-teal-400/10 to-emerald-400/5 blur-[100px] animate-gradient-rotate" style={{ animationDelay: '-5s' }} />
        </div>

        <div className="max-w-3xl mx-auto text-center relative z-10">
          <h1 className="text-fluid-5xl font-bold tracking-tight leading-[1.1] animate-reveal-up" style={{ animationDelay: '100ms' }}>
            Club Finance,
            <br />
            <span className="bg-gradient-to-r from-primary via-violet-500 to-cyan-400 bg-clip-text text-transparent">
              Fully Automated
            </span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed animate-reveal-up" style={{ animationDelay: '200ms' }}>
            Import from Venmo, Zelle, CashApp &amp; PayPal. Reconcile payments automatically. Let AI handle the rest.
          </p>
          <div className="mt-10 animate-reveal-up" style={{ animationDelay: '300ms' }}>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-xl px-8 py-3.5 text-sm font-medium bg-gradient-to-r from-primary via-violet-500 to-cyan-400 text-primary-foreground hover:opacity-90 transition-all duration-150 shadow-layered-lg active:scale-[0.98]"
            >
              Get Started Free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────── */}
      <section className="relative py-32 px-6">
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
      <section className="relative py-32 px-6">
        <div className="max-w-5xl mx-auto">
          <ScrollReveal>
            <h2 className="text-center text-fluid-2xl font-bold tracking-tight mb-4">
              Everything You Need
            </h2>
            <p className="text-center text-muted-foreground mb-16 max-w-xl mx-auto">
              From dues collection to expense tracking, Ledgly handles every aspect of your organization&apos;s finances.
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
              Click through to explore Ledgly&apos;s core views.
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

      {/* ── Trust + Pricing ───────────────────────────────────── */}
      <section className="relative py-32 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <ScrollReveal>
            <span className="inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium bg-emerald-500/10 text-emerald-500 mb-8">
              Free for all organizations
            </span>
            <p className="text-fluid-lg font-medium text-muted-foreground mb-10">
              Built for student organizations, Greek life, and campus clubs
            </p>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <div className="flex flex-wrap items-center justify-center gap-8">
              {trustIndicators.map((item) => (
                <div key={item.label} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <div className={cn('p-2 rounded-lg', item.iconBg)}>
                    <item.icon className={cn('h-4 w-4', item.iconColor)} />
                  </div>
                  <span className="font-medium">{item.label}</span>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── CTA + Footer ──────────────────────────────────────── */}
      <section className="relative pb-0 px-6">
        <div className="max-w-3xl mx-auto text-center pb-32">
          <ScrollReveal>
            <h2 className="text-fluid-3xl font-bold tracking-tight mb-4">
              Ready to simplify your finances?
            </h2>
            <p className="text-muted-foreground mb-8">
              No credit card required. Set up your org in minutes.
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
