'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Sparkles,
  Check,
  DollarSign,
  Clock,
  CreditCard,
  Smartphone,
  Bot,
  Table2,
  Users,
  MessageSquare,
  Shield,
  Download,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollReveal } from '@/components/ui/scroll-reveal';

/* ─── Data ───────────────────────────────────────────────────── */

const howItWorks = [
  {
    step: 1,
    title: 'Create Your Org & Invite Members',
    description:
      'Sign up free, name your org, and share a join code. Members set up their profile in seconds.',
  },
  {
    step: 2,
    title: 'Connect Gmail and/or Your Bank',
    description:
      'Link Gmail to detect Venmo, Zelle, CashApp & PayPal notifications — or connect your bank directly via Plaid.',
  },
  {
    step: 3,
    title: 'Ledgly Does the Rest',
    description:
      'Payments are auto-imported, matched to charges, and reminders are sent. You just review.',
  },
];

const featureCards = [
  {
    icon: Sparkles,
    title: 'AI-Powered Management',
    description:
      'Just tell Ledgly what you need in plain English. Create charges, record payments, send reminders — all from a conversation.',
    gradient: 'from-violet-500/20 to-purple-600/20',
    border: 'border-violet-500/30',
  },
  {
    icon: Download,
    title: 'Auto-Import Payments',
    description:
      'Connect Gmail or your bank account via Plaid. Venmo, Zelle, CashApp, and PayPal payments are imported and matched automatically.',
    gradient: 'from-blue-500/20 to-blue-600/20',
    border: 'border-blue-500/30',
  },
  {
    icon: Table2,
    title: 'Smart Spreadsheet',
    description:
      'A full ledger with column resizing, multi-sort, filters, keyboard navigation, and right-click bulk editing. Feels like Google Sheets, built for finances.',
    gradient: 'from-cyan-500/20 to-teal-600/20',
    border: 'border-cyan-500/30',
  },
  {
    icon: Users,
    title: 'Member Portal',
    description:
      'Members see what they owe and pay with one tap via Venmo, CashApp, or PayPal deep links. No app download needed.',
    gradient: 'from-emerald-500/20 to-green-600/20',
    border: 'border-emerald-500/30',
  },
  {
    icon: MessageSquare,
    title: 'Group Chat Notifications',
    description:
      'Connect GroupMe, Discord, or Slack. Get payment confirmations, overdue reminders, and weekly summaries in your group chat.',
    gradient: 'from-amber-500/20 to-orange-600/20',
    border: 'border-amber-500/30',
  },
  {
    icon: Shield,
    title: 'Bank-Grade Security',
    description:
      'Plaid for secure bank connections, encrypted data, role-based access, full audit trail with undo/redo on every action.',
    gradient: 'from-rose-500/20 to-pink-600/20',
    border: 'border-rose-500/30',
  },
];

const showcaseTabs = [
  {
    label: 'Home',
    slug: 'dashboard',
    description:
      'Key metrics, activity feed, and AI suggestions at a glance.',
  },
  {
    label: 'Spreadsheet',
    slug: 'members',
    description:
      'Full financial ledger with sort, filter, resize, and bulk editing.',
  },
  {
    label: 'Members',
    slug: 'inbox',
    description:
      'Manage your team, see who owes what, send reminders.',
  },
  {
    label: 'AI Agent',
    slug: null,
    description:
      'Manage everything in plain English.',
  },
  {
    label: 'Member Portal',
    slug: 'audit-log',
    description:
      'Simple view for members to check balances and pay.',
  },
];

const whyLedgly = [
  {
    icon: DollarSign,
    title: 'No fees',
    description: 'Other tools charge 2\u20133% per transaction. Ledgly is free.',
  },
  {
    icon: Smartphone,
    title: 'Works with your existing apps',
    description:
      'Venmo, Zelle, CashApp, PayPal, Gmail, GroupMe, Discord, Slack \u2014 no new apps to download.',
  },
  {
    icon: Bot,
    title: 'AI that actually works',
    description:
      'Natural language commands, smart matching, proactive suggestions. Not a chatbot \u2014 a real financial assistant.',
  },
];

const integrations = [
  { label: 'Venmo', category: 'payment' },
  { label: 'Zelle', category: 'payment' },
  { label: 'CashApp', category: 'payment' },
  { label: 'PayPal', category: 'payment' },
  { label: 'Gmail', category: 'sync' },
  { label: 'Plaid', category: 'sync' },
  { label: 'GroupMe', category: 'notification' },
  { label: 'Discord', category: 'notification' },
  { label: 'Slack', category: 'notification' },
];

const faqItems = [
  {
    q: 'Is it really free?',
    a: "Yes. Ledgly is completely free with no transaction fees. We don't touch your money — we just help you track it.",
  },
  {
    q: 'Do members need to download an app?',
    a: 'No. Members access their portal through a web link. They keep paying through Venmo, Zelle, CashApp, or PayPal as usual.',
  },
  {
    q: 'How does Gmail sync work?',
    a: 'You connect your Gmail account, and Ledgly reads payment notification emails from Venmo, Zelle, CashApp, and PayPal. We only read emails from these specific senders — never your personal emails.',
  },
  {
    q: 'Is my data secure?',
    a: 'Yes. All data is encrypted in transit and at rest. Bank connections use Plaid\u2019s bank-grade security. We never store your banking credentials.',
  },
  {
    q: 'Can I use this for my fraternity/sorority?',
    a: 'Absolutely. Ledgly was built specifically for Greek life, student clubs, and organizations that collect dues and manage shared finances.',
  },
  {
    q: 'What if we already use OmegaFi or Greek Capital?',
    a: 'Ledgly is simpler, free, and AI-powered. You can try it alongside your current tool — setup takes 5 minutes.',
  },
];

/* ─── Typewriter ─────────────────────────────────────────────── */

function useTypewriter(texts: string[], speed = 60, pause = 2000) {
  const [displayed, setDisplayed] = useState('');
  const [textIndex, setTextIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = texts[textIndex];

    if (!deleting && charIndex <= current.length) {
      const timer = setTimeout(() => {
        setDisplayed(current.slice(0, charIndex));
        setCharIndex(charIndex + 1);
      }, charIndex === current.length ? pause : speed);
      return () => clearTimeout(timer);
    }

    if (!deleting && charIndex > current.length) {
      setDeleting(true);
      return;
    }

    if (deleting && charIndex >= 0) {
      const timer = setTimeout(() => {
        setDisplayed(current.slice(0, charIndex));
        setCharIndex(charIndex - 1);
      }, speed / 2);
      return () => clearTimeout(timer);
    }

    if (deleting && charIndex < 0) {
      setDeleting(false);
      setCharIndex(0);
      setTextIndex((textIndex + 1) % texts.length);
    }
  }, [texts, textIndex, charIndex, deleting, speed, pause]);

  return displayed;
}

/* ─── Glow Card ──────────────────────────────────────────────── */

function GlowCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  return (
    <div
      className={cn('relative', className)}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
      onMouseLeave={() => setMousePos(null)}
    >
      {mousePos && (
        <div
          className="pointer-events-none absolute inset-0 z-10 rounded-2xl"
          style={{
            background: `radial-gradient(400px circle at ${mousePos.x}px ${mousePos.y}px, rgba(59,130,246,0.06), transparent 70%)`,
          }}
        />
      )}
      {children}
    </div>
  );
}

/* ─── Component ──────────────────────────────────────────────── */

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [openFaq, setOpenFaq] = useState<Set<number>>(new Set());

  const typewriterText = useTypewriter([
    'Venmo Payments',
    'Zelle Transfers',
    'CashApp Payments',
    'PayPal Receipts',
  ], 70, 2500);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const currentTab = showcaseTabs[activeTab];

  const toggleFaq = (i: number) =>
    setOpenFaq((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  return (
    <div className="min-h-dvh bg-background text-foreground relative overflow-x-hidden">
      {/* Gradient mesh background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-blue-600/5 to-purple-600/5 dark:from-blue-600/20 dark:to-purple-600/20 rounded-full blur-[120px] animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-gradient-to-br from-cyan-500/5 to-blue-600/5 dark:from-cyan-500/15 dark:to-blue-600/15 rounded-full blur-[100px] animate-float" style={{ animationDelay: '-5s' }} />
        <div className="absolute top-1/2 right-1/3 w-[400px] h-[400px] bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 dark:from-violet-500/10 dark:to-fuchsia-500/10 rounded-full blur-[100px] animate-float" style={{ animationDelay: '-3s' }} />
      </div>

      {/* ── Navbar ────────────────────────────────────────────── */}
      <header
        className={cn(
          'fixed top-0 inset-x-0 z-50 transition-all duration-300',
          scrolled
            ? 'bg-background/80 dark:bg-white/5 backdrop-blur-xl border-b border-border/50 dark:border-white/10 shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)]'
            : 'bg-transparent border-b border-transparent',
        )}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between h-16 px-6">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="Ledgly" width={36} height={36} />
            <span className="font-bold text-xl tracking-tight text-foreground">Ledgly</span>
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
              className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium bg-primary dark:bg-gradient-to-r dark:from-blue-500 dark:to-cyan-400 text-primary-foreground shadow-lg dark:shadow-[0_0_20px_rgba(59,130,246,0.5)] hover:shadow-xl dark:hover:shadow-[0_0_30px_rgba(59,130,246,0.7)] transition-all duration-200 active:scale-[0.98]"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="relative pt-36 pb-20 md:pt-48 md:pb-32 px-6">
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <div className="animate-reveal-up" style={{ animationDelay: '0ms' }}>
            <span className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium bg-card/50 dark:bg-white/5 backdrop-blur-xl border border-border/50 dark:border-white/10 text-primary dark:text-cyan-300 mb-6">
              <Check className="h-3.5 w-3.5" />
              Free forever — no fees, no credit card
            </span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.1] text-foreground animate-reveal-up" style={{ animationDelay: '100ms' }}>
            Stop Chasing
            <br />
            <span className="bg-gradient-to-r from-foreground via-primary to-primary/60 dark:from-white dark:via-blue-200 dark:to-cyan-300 bg-clip-text text-transparent">
              {typewriterText}<span className="animate-pulse text-primary">|</span>
            </span>
            <br />
            <span className="text-muted-foreground text-3xl md:text-5xl">in a Spreadsheet</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-7 animate-reveal-up" style={{ animationDelay: '200ms' }}>
            Connect your Gmail. We auto-import Venmo, Zelle, CashApp &amp; PayPal payments and match them to dues — for free.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 animate-reveal-up" style={{ animationDelay: '300ms' }}>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-xl px-8 py-3.5 text-sm font-medium bg-primary dark:bg-gradient-to-r dark:from-blue-500 dark:to-cyan-400 text-primary-foreground shadow-lg dark:shadow-[0_0_20px_rgba(59,130,246,0.5)] hover:shadow-xl dark:hover:shadow-[0_0_30px_rgba(59,130,246,0.7)] transition-all duration-200 active:scale-[0.98]"
            >
              Get Started Free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center rounded-xl px-8 py-3.5 text-sm font-medium bg-card/50 dark:bg-white/5 backdrop-blur-xl border border-border/50 dark:border-white/10 text-foreground hover:bg-card/80 dark:hover:bg-white/10 hover:border-border dark:hover:border-white/20 transition-all duration-200 active:scale-[0.98]"
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
          <div className="rounded-2xl border border-border/50 dark:border-white/10 overflow-hidden shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)] bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-cyan-500/10 dark:from-blue-500/20 dark:via-purple-500/20 dark:to-cyan-500/20 backdrop-blur-xl flex flex-col items-center justify-center aspect-[1230/790]">
            <div className="p-4 rounded-2xl bg-white/10 dark:bg-white/5 border border-white/20 dark:border-white/10 mb-4">
              <Table2 className="h-10 w-10 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground font-medium">Screenshot coming soon</p>
          </div>
        </div>
      </section>

      {/* ── Social Proof Bar ──────────────────────────────────── */}
      <section className="relative py-12 px-6 border-y border-border/50 dark:border-white/10">
        <div className="max-w-4xl mx-auto">
          <ScrollReveal>
            <p className="text-center text-sm text-muted-foreground mb-8">
              Built for fraternities, clubs, and student organizations
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
              {[
                { icon: DollarSign, label: '100% Free', sublabel: 'No fees, no catches' },
                { icon: CreditCard, label: 'Works with Venmo, Zelle, CashApp & PayPal', sublabel: 'Keep your existing apps' },
                { icon: Clock, label: 'Setup in under 5 minutes', sublabel: 'From signup to tracking' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 justify-center">
                  <div className="p-2 rounded-lg shrink-0 bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/30">
                    <item.icon className="h-4 w-4 text-primary dark:text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.sublabel}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────── */}
      <section id="how-it-works" className="relative py-24 md:py-36 px-6 scroll-mt-20">
        <div className="max-w-5xl mx-auto">
          <ScrollReveal>
            <h2 className="text-center text-3xl md:text-4xl font-bold tracking-tight mb-16 text-foreground">
              How It Works
            </h2>
          </ScrollReveal>

          <div className="relative grid gap-12 md:gap-0 md:grid-cols-3">
            <div className="hidden md:block absolute top-8 left-[16.67%] right-[16.67%] h-0.5 bg-gradient-to-r from-blue-500/40 via-cyan-400/40 to-blue-500/40" />

            {howItWorks.map((item, i) => (
              <ScrollReveal key={item.step} delay={i * 150}>
                <div className="flex flex-col items-center text-center px-6">
                  <div className="relative z-10 w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-primary-foreground bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg dark:shadow-[0_0_20px_rgba(59,130,246,0.4)] mb-6">
                    {item.step}
                  </div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">{item.title}</h3>
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
      <section id="features" className="relative py-24 md:py-36 px-6 scroll-mt-20">
        <div className="max-w-5xl mx-auto">
          <ScrollReveal>
            <h2 className="text-center text-3xl md:text-4xl font-bold tracking-tight mb-4 text-foreground">
              Everything You Need
            </h2>
            <p className="text-center text-muted-foreground mb-16 max-w-xl mx-auto leading-7">
              Stop juggling spreadsheets, Venmo screenshots, and group chats. Ledgly handles it all.
            </p>
          </ScrollReveal>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {featureCards.map((feature, i) => (
              <ScrollReveal key={feature.title} delay={i * 120}>
                <GlowCard className="h-full">
                  <div
                    className="rounded-2xl bg-card/50 dark:bg-white/5 backdrop-blur-xl border border-border/50 dark:border-white/10 p-8 hover:bg-card/80 dark:hover:bg-white/10 hover:border-border dark:hover:border-white/20 hover:scale-[1.02] shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all duration-200 h-full"
                  >
                    <div className={cn('p-2.5 rounded-lg w-fit mb-4 bg-gradient-to-br border', feature.gradient, feature.border)}>
                      <feature.icon className="h-5 w-5 text-foreground" />
                    </div>
                    <h3 className="font-semibold mb-2 text-foreground">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </GlowCard>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Integrations ──────────────────────────────────────── */}
      <section className="relative py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <ScrollReveal>
            <h2 className="text-center text-2xl md:text-3xl font-bold tracking-tight mb-4 text-foreground">
              Integrations
            </h2>
            <p className="text-center text-muted-foreground mb-10 max-w-md mx-auto leading-7">
              Ledgly connects to the tools your org already uses.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {integrations.map((item) => (
                <span
                  key={item.label}
                  className="inline-flex items-center rounded-full px-4 py-2 text-sm font-medium bg-card/50 dark:bg-white/5 border border-border/50 dark:border-white/10 text-muted-foreground hover:bg-card/80 dark:hover:bg-white/10 hover:border-border dark:hover:border-white/20 transition-all duration-200"
                >
                  {item.label}
                </span>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Showcase (tabbed) ─────────────────────────────────── */}
      <section className="relative py-24 md:py-36 px-6">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
            <h2 className="text-center text-3xl md:text-4xl font-bold tracking-tight mb-4 text-foreground">
              See It in Action
            </h2>
            <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto leading-7">
              Click through to explore every view.
            </p>
          </ScrollReveal>

          <ScrollReveal>
            <div className="flex flex-wrap justify-center gap-2 mb-10">
              {showcaseTabs.map((tab, i) => (
                <button
                  key={tab.label}
                  onClick={() => setActiveTab(i)}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                    activeTab === i
                      ? 'bg-primary dark:bg-gradient-to-r dark:from-blue-500 dark:to-cyan-400 text-primary-foreground shadow-lg dark:shadow-[0_0_20px_rgba(59,130,246,0.4)]'
                      : 'bg-card/50 dark:bg-white/5 text-muted-foreground hover:bg-card/80 dark:hover:bg-white/10 hover:text-foreground border border-border/50 dark:border-white/10',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <div className="flex flex-col md:flex-row items-center gap-8 md:gap-16">
              <div className="flex-1 min-w-0 w-full">
                {currentTab.slug ? (
                  <div className="rounded-2xl border border-border/50 dark:border-white/10 overflow-hidden shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)] bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-cyan-500/10 dark:from-blue-500/20 dark:via-purple-500/20 dark:to-cyan-500/20 backdrop-blur-xl flex flex-col items-center justify-center aspect-[1230/790]">
                    <div className="p-4 rounded-2xl bg-white/10 dark:bg-white/5 border border-white/20 dark:border-white/10 mb-4">
                      <Table2 className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">Screenshot coming soon</p>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-card/50 dark:bg-white/5 backdrop-blur-xl border border-border/50 dark:border-white/10 shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)] p-8 md:p-12 flex flex-col items-center justify-center min-h-[320px] md:min-h-[400px]">
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/30 mb-6">
                      <Sparkles className="h-10 w-10 text-primary dark:text-cyan-400" />
                    </div>
                    <p className="text-muted-foreground text-sm mb-6 text-center max-w-sm">
                      &quot;Charge all active members $50 for Spring Dues&quot;
                    </p>
                    <div className="flex flex-col gap-3 w-full max-w-xs">
                      <div className="rounded-lg border border-border/50 dark:border-white/10 bg-card/50 dark:bg-white/5 p-3 text-sm">
                        <span className="font-medium text-foreground">LedgelyAI</span>
                        <span className="text-muted-foreground ml-2">
                          I&apos;ll create a $50.00 &quot;Spring Dues&quot; charge for 24 active members.
                        </span>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <span className="inline-flex items-center rounded-lg px-4 py-2 text-xs font-medium bg-card/50 dark:bg-white/5 border border-border/50 dark:border-white/10 text-muted-foreground">
                          Cancel
                        </span>
                        <span className="inline-flex items-center rounded-lg px-4 py-2 text-xs font-medium bg-primary dark:bg-gradient-to-r dark:from-blue-500 dark:to-cyan-400 text-primary-foreground">
                          Confirm
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-semibold mb-3 text-foreground">{currentTab.label}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {currentTab.description}
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Why Ledgly ─────────────────────────────────────────── */}
      <section className="relative py-24 md:py-36 px-6">
        <div className="max-w-5xl mx-auto">
          <ScrollReveal>
            <h2 className="text-center text-3xl md:text-4xl font-bold tracking-tight mb-4 text-foreground">
              Why Ledgly
            </h2>
            <p className="text-center text-muted-foreground mb-16 max-w-xl mx-auto leading-7">
              Other tools charge fees, force members onto new platforms, or lack modern features. We don&apos;t.
            </p>
          </ScrollReveal>

          <div className="grid gap-8 sm:grid-cols-3">
            {whyLedgly.map((item, i) => (
              <ScrollReveal key={item.title} delay={i * 100}>
                <GlowCard className="h-full">
                  <div className="rounded-2xl bg-card/50 dark:bg-white/5 backdrop-blur-xl border border-border/50 dark:border-white/10 p-8 text-center hover:bg-card/80 dark:hover:bg-white/10 hover:border-border dark:hover:border-white/20 hover:scale-[1.02] shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all duration-200 h-full">
                    <div className="p-3 rounded-xl w-fit mx-auto mb-5 bg-gradient-to-br from-blue-500/20 to-cyan-600/20 border border-blue-500/30">
                      <item.icon className="h-6 w-6 text-primary dark:text-cyan-400" />
                    </div>
                    <h3 className="font-semibold mb-2 text-foreground">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </GlowCard>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────── */}
      <section className="relative py-24 md:py-36 px-6">
        <div className="max-w-2xl mx-auto">
          <ScrollReveal>
            <h2 className="text-center text-3xl md:text-4xl font-bold tracking-tight mb-4 text-foreground">
              Frequently Asked Questions
            </h2>
            <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto leading-7">
              Everything you need to know before getting started.
            </p>
          </ScrollReveal>

          <div className="space-y-3">
            {faqItems.map((item, i) => (
              <ScrollReveal key={i} delay={i * 100}>
                <div className="rounded-2xl bg-card/50 dark:bg-white/5 backdrop-blur-xl border border-border/50 dark:border-white/10 shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden transition-all duration-200 hover:border-border dark:hover:border-white/20">
                  <button
                    onClick={() => toggleFaq(i)}
                    className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                  >
                    <span className="text-sm font-medium text-foreground">{item.q}</span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                        openFaq.has(i) && 'rotate-180',
                      )}
                    />
                  </button>
                  <div
                    className={cn(
                      'grid transition-all duration-200',
                      openFaq.has(i) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                    )}
                  >
                    <div className="overflow-hidden">
                      <p className="px-6 pb-5 text-sm text-muted-foreground leading-relaxed">
                        {item.a}
                      </p>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA + Footer ──────────────────────────────────────── */}
      <section className="relative pb-0 px-6">
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        <div className="max-w-3xl mx-auto text-center pb-32 relative z-10">
          <ScrollReveal>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 bg-gradient-to-r from-foreground via-primary to-primary/60 dark:from-white dark:via-blue-200 dark:to-cyan-300 bg-clip-text text-transparent">
              Ready to ditch the spreadsheet?
            </h2>
            <p className="text-muted-foreground mb-8">
              Free forever. Set up in 5 minutes.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-xl px-8 py-3.5 text-sm font-medium bg-primary dark:bg-gradient-to-r dark:from-blue-500 dark:to-cyan-400 text-primary-foreground shadow-lg dark:shadow-[0_0_20px_rgba(59,130,246,0.5)] hover:shadow-xl dark:hover:shadow-[0_0_30px_rgba(59,130,246,0.7)] transition-all duration-200 active:scale-[0.98]"
            >
              Get Started Free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </ScrollReveal>
        </div>

        <footer className="w-full border-t border-border/50 dark:border-white/10 py-8 px-6">
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
