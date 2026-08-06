import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight,
  Database,
  Dna,
  FileText,
  Lock,
  Zap,
} from "lucide-react";

/**
 * Full-screen "locked" gate shown when there is no authenticated session.
 *
 * Rendered by App.tsx in place of the workspace whenever the user signs out
 * (or arrives without a session). Signing back in via the hosted AuthModal
 * restores the workspace; the app-wide auth listener picks up the new session
 * automatically. Entering guest mode hands control straight to App.tsx, which
 * swaps in the restricted workspace.
 *
 * Modern SaaS split-hero landing: a clean 2-column layout on a deep slate
 * canvas with an ultra-subtle medical grid overlay and soft ambient glows.
 * Left column carries the brand + value proposition with a 3-card feature
 * highlight grid; right column is the glass "access portal" card. Pure CSS
 * entrance animations (staggered, honours prefers-reduced-motion) — no
 * canvas, no particles.
 */
export default function AuthLandingView({
  onSignIn,
  onContinueAsGuest,
}: {
  onSignIn: () => void;
  onContinueAsGuest: () => void;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      {/* Ultra-subtle medical grid overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:32px_32px]"
      />

      {/* Soft ambient blue/cyan glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-blue-600/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-44 -right-40 h-[34rem] w-[34rem] rounded-full bg-cyan-400/10 blur-3xl"
      />

      <main className="relative z-10">
        <div className="mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 items-center gap-12 px-8 lg:grid-cols-12">
          {/* ── Left column — brand & value proposition ── */}
          <div className="lg:col-span-7">
            <div
              className="mb-6 flex w-fit animate-fade-in-up items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold tracking-wider text-blue-400 motion-reduce:animate-none"
              style={stagger(0)}
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400 motion-reduce:animate-none"
              />
              CLINICAL TRIALS MATCHING ENGINE
            </div>

            <h1
              className="mb-4 animate-fade-in-up font-heading text-4xl font-extrabold leading-tight tracking-tight text-white motion-reduce:animate-none lg:text-5xl"
              style={stagger(80)}
            >
              Precision Trial Matching Powered by{" "}
              <span className="bg-gradient-to-r from-blue-400 via-sky-400 to-cyan-300 bg-clip-text text-transparent">
                AI Genomics.
              </span>
            </h1>

            <p
              className="mb-8 max-w-xl animate-fade-in-up text-lg leading-relaxed text-slate-400 motion-reduce:animate-none"
              style={stagger(160)}
            >
              Instantly parse NGS reports, structure complex biomarker profiles,
              and match oncology patients with active ClinicalTrials.gov
              protocols.
            </p>

            {/* Feature highlights */}
            <div
              className="grid animate-fade-in-up grid-cols-1 gap-4 motion-reduce:animate-none sm:grid-cols-3"
              style={stagger(240)}
            >
              <FeatureCard
                icon={<FileText className="h-5 w-5" aria-hidden="true" />}
                title="Auto-Parse"
                body="Extracts EGFR, KRAS, BRCA1"
              />
              <FeatureCard
                icon={<Zap className="h-5 w-5" aria-hidden="true" />}
                title="Live Sync"
                body="Connected to ClinicalTrials.gov"
              />
              <FeatureCard
                icon={<Database className="h-5 w-5" aria-hidden="true" />}
                title="Unmatched Registry"
                body="Identifies unmet trial demand"
              />
            </div>
          </div>

          {/* ── Right column — access portal card ── */}
          <div
            className="animate-fade-in-up motion-reduce:animate-none lg:col-span-5"
            style={stagger(160)}
          >
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-blue-950/40 backdrop-blur-xl">
              {/* Card header */}
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600/15 ring-1 ring-blue-500/20">
                  <Dna className="h-6 w-6 text-blue-400" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-heading text-lg font-bold tracking-tight text-white">
                    Aethel Bio Workspace
                  </h2>
                  <p className="text-sm text-slate-400">
                    Sign in or continue as guest to launch the matching suite.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <button
                onClick={onSignIn}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-medium text-white shadow-lg shadow-blue-600/20 transition-all duration-150 hover:bg-blue-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              >
                Sign In to Account
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>

              <button
                onClick={onContinueAsGuest}
                className="mt-3 w-full cursor-pointer rounded-xl border border-slate-700/60 bg-slate-800/80 py-3 font-medium text-slate-300 transition-all duration-150 hover:bg-slate-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              >
                Continue as Guest (Demo)
              </button>

              {/* Compliance footer */}
              <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
                <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Encrypted Clinical Environment • US East Node
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Feature highlight card ────────────────────────────────────────────── */

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="group rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm transition-colors duration-200 hover:border-slate-700">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20 transition-transform duration-200 group-hover:scale-105">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">{body}</p>
    </div>
  );
}

/* ── Staggered entrance helper (pure CSS, honours reduced motion) ──────── */

function stagger(delayMs: number): CSSProperties {
  return {
    animationDelay: `${delayMs}ms`,
    animationFillMode: "backwards",
  };
}
