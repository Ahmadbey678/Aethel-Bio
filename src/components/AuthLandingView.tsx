import type { ReactNode } from "react";
import { Activity, Dna, LogIn, ScanSearch, Users } from "lucide-react";

/**
 * Full-screen "locked" gate shown when there is no authenticated session.
 *
 * Rendered by App.tsx in place of the workspace whenever the user signs out
 * (or arrives without a session). Signing back in via the hosted AuthModal
 * restores the workspace; the app-wide auth listener picks up the new session
 * automatically.
 *
 * Clean clinical AI SaaS landing: a deep slate canvas with an ultra-subtle
 * medical grid overlay, soft ambient blue/cyan glows behind the sign-in card,
 * three floating glassmorphism capability cards, and a system status header
 * bar. No canvas / particle animation — pure CSS.
 */
export default function AuthLandingView({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      {/* Ultra-subtle medical grid overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:32px_32px]"
      />

      {/* Soft ambient blue/cyan glows behind the central card */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-3xl"
      />

      {/* ── Top system header bar ── */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-muted ring-1 ring-primary/20">
            <Dna className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <span className="font-heading text-sm font-bold tracking-tight text-text-primary">
            Aethel Bio
          </span>
        </div>

        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 motion-reduce:animate-none"
          />
          System Operational — Version 2.4.0
        </span>
      </header>

      {/* ── Central sign-in card ── */}
      <main className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm animate-fade-in-up text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-muted ring-1 ring-primary/20">
            <Dna className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>

          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-text-primary">
            Aethel Bio
          </h1>
          <p className="mt-2 inline-flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-[0.32em] text-accent/90">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent motion-reduce:animate-none"
            />
            Precision Oncology Unit
          </p>

          <div className="mt-8 rounded-xl border border-border-subtle bg-slate-900/80 p-6 shadow-card backdrop-blur-sm">
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface/60">
              <LogIn className="h-5 w-5 text-text-muted" aria-hidden="true" />
            </div>
            <h2 className="font-heading text-base font-semibold text-text-primary">
              Sign in to continue
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
              Authorized clinical staff only. Sign in to access the clinical trial workspace.
            </p>
            <button
              onClick={onSignIn}
              className="mt-5 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-all duration-150 hover:bg-primary-hover active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Sign In
            </button>
          </div>

          <p className="mt-5 text-[11px] text-text-muted">Connected to ClinicalTrials.gov</p>
        </div>
      </main>

      {/* ── Floating capability micro-cards (desktop only) ── */}
      <MicroCard
        className="absolute left-8 top-24 hidden lg:flex"
        icon={<ScanSearch className="h-4 w-4 text-primary" aria-hidden="true" />}
        title="Genomic Biomarker Extraction"
        subtext="Auto-parses EGFR, KRAS, BRCA1 from NGS reports"
        delay="0ms"
      />
      <MicroCard
        className="absolute right-8 top-24 hidden lg:flex"
        icon={<Activity className="h-4 w-4 text-primary" aria-hidden="true" />}
        title="ClinicalTrials.gov Engine"
        badge="Real-time Sync Active"
        delay="120ms"
      />
      <MicroCard
        className="absolute bottom-24 right-8 hidden lg:flex"
        icon={<Users className="h-4 w-4 text-primary" aria-hidden="true" />}
        title="Unmatched Patient Registry"
        subtext="Identifies cohort demand for new trial arms"
        delay="240ms"
      />
    </div>
  );
}

/* ── Floating glassmorphism capability card ───────────────────────────── */

interface MicroCardProps {
  className?: string;
  icon: ReactNode;
  title: string;
  subtext?: string;
  badge?: string;
  delay?: string;
}

function MicroCard({ className = "", icon, title, subtext, badge, delay = "0ms" }: MicroCardProps) {
  return (
    <div
      className={`w-60 animate-fade-in-up rounded-xl border border-border-subtle bg-slate-900/60 p-4 text-left shadow-card backdrop-blur-md motion-reduce:animate-none ${className}`}
      style={{ animationDelay: delay, animationFillMode: "backwards" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-muted ring-1 ring-primary/20">
          {icon}
        </div>
        {badge && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-400">
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-emerald-400" />
            {badge}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm font-semibold leading-snug text-text-primary">{title}</p>
      {subtext && <p className="mt-1 text-xs leading-relaxed text-text-secondary">{subtext}</p>}
    </div>
  );
}
