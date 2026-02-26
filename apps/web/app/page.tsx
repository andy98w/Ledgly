'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Receipt, RefreshCw, Smartphone, Table2, Shield, Zap, Users } from 'lucide-react';
import { ScrollReveal } from '@/components/ui/scroll-reveal';

const features = [
  {
    icon: Receipt,
    title: 'Track Dues',
    description: 'Create charges for dues, fees, and fines. See who owes what at a glance.',
    iconBg: 'bg-amber-500/10',
    iconText: 'text-amber-500',
    hoverBorder: 'hover:border-amber-500/30',
  },
  {
    icon: RefreshCw,
    title: 'Auto-Reconcile Payments',
    description: 'Payments are automatically matched to outstanding charges — no manual bookkeeping.',
    iconBg: 'bg-emerald-500/10',
    iconText: 'text-emerald-500',
    hoverBorder: 'hover:border-emerald-500/30',
  },
  {
    icon: Smartphone,
    title: 'Import from Venmo & Zelle',
    description: 'Connect your Gmail to auto-import payment notifications from Venmo and Zelle.',
    iconBg: 'bg-cyan-500/10',
    iconText: 'text-cyan-500',
    hoverBorder: 'hover:border-cyan-500/30',
  },
  {
    icon: Table2,
    title: 'Spreadsheet View',
    description: 'See every member and charge in a single spreadsheet. Filter, sort, and export.',
    iconBg: 'bg-violet-500/10',
    iconText: 'text-violet-500',
    hoverBorder: 'hover:border-violet-500/30',
  },
];

const showcaseLabelColors = [
  'text-primary',
  'text-violet-500',
  'text-emerald-500',
  'text-cyan-500',
  'text-amber-500',
  'text-rose-500',
  'text-violet-500',
  'text-emerald-500',
];

const showcaseSections = [
  {
    title: 'Dashboard',
    heading: 'Your finances at a glance',
    description: 'See outstanding dues, collected payments, member count, and overdue balances — all in one view. Quick actions let you add members, create charges, or record payments instantly.',
    slug: 'dashboard',
  },
  {
    title: 'Members',
    heading: 'Manage your roster',
    description: 'Track every member in your organization with their payment history, outstanding balances, and contact info. Add members individually or invite them in bulk.',
    slug: 'members',
  },
  {
    title: 'Charges',
    heading: 'Track dues, fees, and fines',
    description: 'Create charges for anything — semester dues, event fees, or fines. See payment status at a glance and know exactly who owes what.',
    slug: 'charges',
  },
  {
    title: 'Payments',
    heading: 'Reconcile payments automatically',
    description: 'Payments are matched to outstanding charges with smart auto-allocation. Allocate manually when needed, or let the system handle it for you.',
    slug: 'payments',
  },
  {
    title: 'Expenses',
    heading: 'Track where money goes',
    description: 'Log organization expenses with categories, vendors, and dates. Keep a clear record of every dollar spent alongside incoming payments.',
    slug: 'expenses',
  },
  {
    title: 'Inbox',
    heading: 'Import from Venmo & Zelle',
    description: 'Connect your Gmail to auto-import payment notifications. Payments are parsed and matched automatically — just review and confirm.',
    slug: 'inbox',
  },
  {
    title: 'Spreadsheet',
    heading: 'The full picture in one view',
    description: 'See every member and charge in a familiar spreadsheet layout. Filter, sort, and get the bird\'s-eye view your treasurer needs.',
    slug: 'spreadsheet',
  },
  {
    title: 'Audit Log',
    heading: 'Full transparency and accountability',
    description: 'Every action is tracked — who created a charge, who recorded a payment, who made changes. Undo and redo any action with one click.',
    slug: 'audit-log',
  },
];

const trustIndicators = [
  { icon: Shield, label: 'Bank-level security', iconColor: 'text-emerald-500', iconBg: 'bg-emerald-500/10' },
  { icon: Zap, label: 'Set up in minutes', iconColor: 'text-amber-500', iconBg: 'bg-amber-500/10' },
  { icon: Users, label: 'Built for teams', iconColor: 'text-violet-500', iconBg: 'bg-violet-500/10' },
];

const sectionLabels = [
  'Hero',
  'Features',
  ...showcaseSections.map((s) => s.title),
  'Get Started',
];

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      setScrolled(el.scrollTop > 20);
      const h = el.clientHeight;
      if (h > 0) {
        setActiveSection(Math.min(Math.round(el.scrollTop / h), sectionLabels.length - 1));
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToSection = useCallback((i: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: i * el.clientHeight, behavior: 'smooth' });
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-dvh overflow-y-auto overflow-x-hidden snap-y snap-mandatory bg-background text-foreground relative"
    >
      {/* Fixed background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-primary/5 via-violet-500/3 to-cyan-500/5 pointer-events-none z-0" />

      {/* Fixed subtle grid */}
      <div
        className="fixed inset-0 opacity-[0.02] pointer-events-none z-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke='rgb(255 255 255 / 0.5)'%3e%3cpath d='M0 .5H31.5V32'/%3e%3c/svg%3e")`,
        }}
      />

      {/* Navbar */}
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-layered-sm'
            : 'bg-transparent border-b border-transparent'
        }`}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between h-16 px-6">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Ledgly"
              width={36}
              height={36}
            />
            <span className="font-bold text-xl tracking-tight">Ledgly</span>
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-medium bg-secondary/50 hover:bg-secondary transition-all duration-150"
          >
            Log In
          </Link>
        </div>
      </header>

      {/* Dot navigation */}
      <nav
        className="fixed right-6 top-1/2 -translate-y-1/2 z-50 hidden md:flex flex-col gap-3"
        aria-label="Section navigation"
      >
        {sectionLabels.map((label, i) => (
          <button
            key={label}
            onClick={() => scrollToSection(i)}
            className="group relative flex items-center justify-end"
            aria-label={`Go to ${label}`}
          >
            <span className="absolute right-5 px-2 py-1 rounded-md bg-popover/90 backdrop-blur-sm text-xs font-medium text-popover-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
              {label}
            </span>
            <span
              className={`rounded-full transition-all duration-300 ${
                activeSection === i
                  ? 'w-2.5 h-2.5 bg-primary'
                  : 'w-1.5 h-1.5 bg-muted-foreground/30 group-hover:bg-muted-foreground/60'
              }`}
            />
          </button>
        ))}
      </nav>

      {/* 1. Hero */}
      <section className="min-h-dvh snap-start relative flex items-center justify-center px-6 noise-overlay">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 via-blue-400/15 to-purple-500/10 blur-[120px] animate-float" />
          <div className="absolute inset-8 rounded-full bg-gradient-to-tr from-blue-400/10 via-primary/15 to-cyan-400/10 blur-[100px] animate-gradient-rotate" />
          <div className="absolute inset-4 rounded-full bg-gradient-to-bl from-violet-500/15 via-purple-400/10 to-fuchsia-500/10 blur-[110px] animate-float" style={{ animationDelay: '-3s' }} />
          <div className="absolute inset-12 rounded-full bg-gradient-to-tl from-cyan-400/10 via-teal-400/10 to-emerald-400/5 blur-[100px] animate-gradient-rotate" style={{ animationDelay: '-5s' }} />
        </div>

        <div className="max-w-3xl mx-auto text-center relative z-10">
          <h1 className="text-fluid-5xl font-bold tracking-tight leading-[1.1] animate-reveal-up" style={{ animationDelay: '100ms' }}>
            Club Finance
            <br />
            <span className="bg-gradient-to-r from-primary via-violet-500 to-cyan-400 bg-clip-text text-transparent">
              Made Simple
            </span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed animate-reveal-up" style={{ animationDelay: '200ms' }}>
            Track dues, reconcile payments, and manage your organization&apos;s finances — all in one place. No spreadsheet gymnastics required.
          </p>
          <div className="mt-10 animate-reveal-up" style={{ animationDelay: '300ms' }}>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl px-8 py-3.5 text-sm font-medium bg-gradient-to-r from-primary via-violet-500 to-cyan-400 text-primary-foreground hover:opacity-90 transition-all duration-150 shadow-layered-lg active:scale-[0.98]"
            >
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* 2. How It Works */}
      <section className="min-h-dvh snap-start relative flex items-center justify-center px-6">
        <div className="max-w-5xl mx-auto w-full">
          <ScrollReveal>
            <h2 className="text-center text-fluid-2xl font-bold tracking-tight mb-12">How It Works</h2>
          </ScrollReveal>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, i) => (
              <ScrollReveal key={feature.title} delay={i * 100}>
                <div className={`rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-6 hover:bg-card/80 hover:-translate-y-1 hover:shadow-layered-lg ${feature.hoverBorder} transition-all duration-200 h-full`}>
                  <div className={`p-2.5 rounded-lg ${feature.iconBg} w-fit mb-4`}>
                    <feature.icon className={`h-5 w-5 ${feature.iconText}`} />
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

      {/* 3–10. Feature Showcase Sections */}
      {showcaseSections.map((section, i) => {
        const isReversed = i % 2 === 1;
        return (
          <section key={section.title} className="min-h-dvh snap-start relative flex items-center justify-center px-6">
            <div className="max-w-6xl mx-auto w-full">
              <ScrollReveal>
                <div className={`flex flex-col ${isReversed ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-8 md:gap-16`}>
                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium ${showcaseLabelColors[i]} mb-2 block`}>{section.title}</span>
                    <h2 className="text-fluid-2xl font-bold tracking-tight mb-4">{section.heading}</h2>
                    <p className="text-muted-foreground leading-relaxed text-lg">{section.description}</p>
                  </div>

                  {/* Screenshot — CSS-only theme switching, no hydration mismatch */}
                  <div className="flex-1 min-w-0 w-full">
                    <div className="rounded-xl border border-border/50 overflow-hidden shadow-layered-lg">
                      <Image
                        src={`/screenshots/light/${section.slug}.png`}
                        alt={`${section.title} screenshot`}
                        width={1230}
                        height={790}
                        className="w-full h-auto block dark:hidden"
                      />
                      <Image
                        src={`/screenshots/dark/${section.slug}.png`}
                        alt={`${section.title} screenshot`}
                        width={1230}
                        height={790}
                        className="w-full h-auto hidden dark:block"
                      />
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </section>
        );
      })}

      {/* 11. Social Proof + CTA + Footer */}
      <section className="min-h-dvh snap-start relative flex flex-col items-center justify-center px-6">
        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-3xl mx-auto">
          {/* Social proof */}
          <ScrollReveal>
            <div className="text-center mb-16">
              <p className="text-fluid-lg font-medium text-muted-foreground mb-8">
                Built for student organizations, Greek life, and campus clubs
              </p>
              <div className="flex flex-wrap items-center justify-center gap-8">
                {trustIndicators.map((item) => (
                  <div key={item.label} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <div className={`p-2 rounded-lg ${item.iconBg}`}>
                      <item.icon className={`h-4 w-4 ${item.iconColor}`} />
                    </div>
                    <span className="font-medium">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>

          {/* CTA */}
          <ScrollReveal>
            <div className="text-center">
              <h2 className="text-fluid-3xl font-bold tracking-tight mb-4">
                Ready to simplify your finances?
              </h2>
              <p className="text-muted-foreground mb-8">
                Join organizations already using Ledgly to manage their dues and payments.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl px-8 py-3.5 text-sm font-medium bg-gradient-to-r from-primary via-violet-500 to-cyan-400 text-primary-foreground hover:opacity-90 transition-all duration-150 shadow-layered-lg active:scale-[0.98]"
              >
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </ScrollReveal>
        </div>

        {/* Footer */}
        <footer className="w-full border-t border-border/50 py-8 px-6 mt-auto">
          <div className="max-w-6xl mx-auto text-center text-sm text-muted-foreground">
            Ledgly &copy; {new Date().getFullYear()}
          </div>
        </footer>
      </section>
    </div>
  );
}
