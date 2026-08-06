import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Dna, Lock, Sparkles } from "lucide-react";
import DnaHelixCanvas from "./DnaHelixCanvas";

interface AuthLandingViewProps {
  onSignIn: () => void;
  onContinueAsGuest?: () => void;
}

/**
 * Split-hero landing for the signed-out state.
 *
 * - Left 50%: badge, headline, sub-headline and the embedded glass access
 *   card (Sign In / Continue as Guest).
 * - Right 50%: high-density particle DNA helix (canvas) with a soft
 *   violet/magenta/cyan glow, on a dark slate canvas with a faint grid.
 * - Left-to-right staggered entrance (staggerChildren ~40ms) that respects
 *   prefers-reduced-motion.
 */
export default function AuthLandingView({ onSignIn, onContinueAsGuest }: AuthLandingViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<"idle" | "enter">("idle");

  // Delay reduction under reduced motion: give content time to mount before
  // the entrance fires so nothing gets cut off.
  const prefersReduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  useEffect(() => {
    const t = window.setTimeout(() => setPhase("enter"), prefersReduced ? 40 : 220);
    return () => window.clearTimeout(t);
  }, [prefersReduced]);

  const ready = phase === "enter";
  const s = (ms: number) => (ready ? `${ms}ms` : "0ms");

  return (
    <div
      ref={containerRef}
      className="bg-slate-950 text-white min-h-screen relative overflow-hidden"
    >
      {/* Atmosphere layers */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_75%_70%_at_35%_40%,black,transparent)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 22% 18%, rgba(139,92,246,0.10), transparent 60%)," +
            "radial-gradient(ellipse 45% 40% at 85% 70%, rgba(6,182,212,0.06), transparent 60%)," +
            "radial-gradient(ellipse 40% 35% at 70% 15%, rgba(217,70,239,0.05), transparent 60%)",
        }}
      />
      {/* Subtle inset vignette to focus the centre */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ boxShadow: "inset 0 0 240px rgba(0,0,0,0.45)" }}
      />

      {/* Right-half helix layer */}
      <div className="absolute right-0 top-0 w-1/2 h-full pointer-events-none">
        <DnaHelixCanvas className="h-full w-full" />
      </div>

      {/* Foreground content */}
      <div className="relative z-10 max-w-7xl mx-auto px-8 lg:px-12 min-h-screen flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-2 items-center gap-12">
          {/* Left: typography + access card */}
          <div
            className="max-w-lg"
            style={{
              opacity: ready ? 1 : 0,
              transform: ready ? "translateY(0)" : "translateY(16px)",
              transition: `opacity 700ms cubic-bezier(0.16,1,0.3,1) ${s(0)}, transform 700ms cubic-bezier(0.16,1,0.3,1) ${s(0)}`,
            }}
          >
            <span
              className="text-xs font-semibold tracking-widest text-violet-400 uppercase mb-4 block"
              style={{
                opacity: ready ? 1 : 0,
                transform: ready ? "translateY(0)" : "translateY(12px)",
                transition: `opacity 600ms cubic-bezier(0.16,1,0.3,1) ${s(40)}, transform 600ms cubic-bezier(0.16,1,0.3,1) ${s(40)}`,
              }}
            >
              <Sparkles className="inline-block w-3.5 h-3.5 -mt-0.5 mr-2 text-violet-400" />
              Purpose of Aethel Bio
            </span>

            <h1
              className="text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-6"
              style={{
                opacity: ready ? 1 : 0,
                transform: ready ? "translateY(0)" : "translateY(12px)",
                transition: `opacity 600ms cubic-bezier(0.16,1,0.3,1) ${s(80)}, transform 600ms cubic-bezier(0.16,1,0.3,1) ${s(80)}`,
              }}
            >
              Precision Trial Matching Powered by{" "}
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
                AI Genomics.
              </span>
            </h1>

            <p
              className="text-slate-400 text-base leading-relaxed mb-8 max-w-lg"
              style={{
                opacity: ready ? 1 : 0,
                transform: ready ? "translateY(0)" : "translateY(12px)",
                transition: `opacity 600ms cubic-bezier(0.16,1,0.3,1) ${s(120)}, transform 600ms cubic-bezier(0.16,1,0.3,1) ${s(120)}`,
              }}
            >
              Instantly parse NGS pathology reports, structure biomarker profiles,
              and match oncology patients with active ClinicalTrials.gov protocols.
            </p>

            {/* Embedded access card */}
            <div
              className="bg-slate-900/80 border border-slate-800 backdrop-blur-xl rounded-2xl p-6 max-w-md shadow-2xl shadow-violet-950/20"
              style={{
                opacity: ready ? 1 : 0,
                transform: ready ? "translateY(0)" : "translateY(16px)",
                transition: `opacity 700ms cubic-bezier(0.16,1,0.3,1) ${s(160)}, transform 700ms cubic-bezier(0.16,1,0.3,1) ${s(160)}`,
              }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-violet-600/15 border border-violet-500/20 flex items-center justify-center">
                  <Dna className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Aethel Bio Workspace</p>
                  <p className="text-xs text-slate-500">Clinical trial intelligence</p>
                </div>
              </div>

              <button
                type="button"
                onClick={onSignIn}
                className="w-full bg-violet-600 hover:bg-violet-500 text-white py-3 font-semibold rounded-xl transition-all shadow-lg shadow-violet-600/30 flex items-center justify-center gap-2 active:scale-[0.97] cursor-pointer"
              >
                Sign In to Workspace
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onContinueAsGuest}
                className="w-full mt-3 text-center text-slate-400 hover:text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 py-2 cursor-pointer active:scale-[0.97]"
              >
                Continue as Guest (Demo)
                <ArrowRight className="w-4 h-4" />
              </button>

              <p className="text-slate-500 text-xs mt-4 block text-center flex items-center justify-center gap-1.5">
                <Lock className="w-3 h-3 text-slate-500" />
                Encrypted Clinical Environment &bull; US East Node
              </p>
            </div>
          </div>

          {/* Right: reserved for the particle graphics */}
          <div className="hidden lg:block" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
