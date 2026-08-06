import { Dna, LogIn } from "lucide-react";
import ParticleBackground from "./ParticleBackground";

/**
 * Full-screen "locked" gate shown when there is no authenticated session.
 *
 * Rendered by App.tsx in place of the workspace whenever the user signs out
 * (or arrives without a session). Signing back in via the hosted AuthModal
 * restores the workspace; the app-wide auth listener picks up the new session
 * automatically.
 *
 * The background is a canvas-driven "precision oncology" particle system —
 * nucleotides and molecular shapes filtering through a rotating double helix
 * into aligned trial badges — with the auth card floating above it at z-10.
 */
export default function LockScreen({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-surface">
      {/* Layered atmosphere behind the particle canvas (no flat fills). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(56,120,255,0.10),transparent_60%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_120%_at_50%_50%,transparent_58%,rgba(0,0,0,0.42))]"
      />

      <ParticleBackground />

      {/* Card floats cleanly above the animation. */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm animate-fade-in-up text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-muted ring-1 ring-primary/20">
            <Dna className="h-7 w-7 text-primary" />
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
              <LogIn className="h-5 w-5 text-text-muted" />
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
              <LogIn className="h-4 w-4" />
              Sign In
            </button>
          </div>

          <p className="mt-5 text-[11px] text-text-muted">Connected to ClinicalTrials.gov</p>
        </div>
      </div>
    </div>
  );
}
