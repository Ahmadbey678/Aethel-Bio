import { useEffect, useMemo, useState } from "react";
import { Dna } from "lucide-react";

interface AuthLandingViewProps {
  onSignIn: () => void;
}

const FEATURES = [
  {
    icon: "📄",
    title: "Auto-Parse →",
    description: "Extracts EGFR, KRAS, TP53",
  },
  {
    icon: "⚡",
    title: "Live Sync →",
    description: "Connected to ClinicalTrials.gov",
  },
  {
    icon: "📊",
    title: "Unmatched Registry →",
    description: "Tracks unmet trial demand",
  },
] as const;

/**
 * Signed-out landing page.
 *
 * - Dark slate canvas with an ultra-subtle medical grid and soft glowing
 *   electric blue radial gradients for depth.
 * - 2-column SaaS layout (7/5): brand messaging + feature cards on the left,
 *   glassmorphism access portal on the right.
 * - Subtle staggered entrance that respects prefers-reduced-motion.
 */
export default function AuthLandingView({ onSignIn }: AuthLandingViewProps) {
  const [phase, setPhase] = useState<"idle" | "enter">("idle");

  // Delay reduction under reduced motion: give content time to mount before
  // the entrance fires so nothing gets cut off.
  const prefersReduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  useEffect(() => {
    const t = window.setTimeout(() => setPhase("enter"), prefersReduced ? 40 : 180);
    return () => window.clearTimeout(t);
  }, [prefersReduced]);

  const ready = phase === "enter";
  const s = (ms: number) => (ready ? `${ms}ms` : "0ms");
  const entrance = (ms: number) => ({
    opacity: ready ? 1 : 0,
    transform: ready ? "translateY(0)" : "translateY(14px)",
    transition: `opacity 650ms cubic-bezier(0.16,1,0.3,1) ${s(ms)}, transform 650ms cubic-bezier(0.16,1,0.3,1) ${s(ms)}`,
  });

  return (
    <div className="bg-slate-950 text-white min-h-screen relative flex items-center justify-center p-8 lg:p-16 overflow-hidden">
      {/* Ultra-subtle medical grid */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_80%_75%_at_50%_40%,black,transparent)]"
      />

      {/* Soft glowing electric blue radial gradients */}
      <div
        aria-hidden="true"
        className="absolute -top-40 -left-32 w-[42rem] h-[42rem] bg-gradient-to-br from-blue-600/10 to-transparent blur-3xl rounded-full"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-48 -right-24 w-[40rem] h-[40rem] bg-gradient-to-tl from-blue-600/10 to-transparent blur-3xl rounded-full"
      />
      <div
        aria-hidden="true"
        className="absolute top-1/3 right-1/4 w-96 h-96 bg-gradient-to-br from-blue-500/10 to-transparent blur-3xl rounded-full"
      />

      <div className="relative z-10 w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
        {/* Left column — main messaging */}
        <div className="lg:col-span-7" style={entrance(0)}>
          <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3.5 py-1.5 rounded-full w-fit mb-6">
            <span aria-hidden="true">✨</span>
            AETHEL BIO • PRECISION ONCOLOGY UNIT
          </span>

          <h1 className="text-5xl lg:text-6xl font-extrabold text-white tracking-tight mb-2">
            Aethel Bio
          </h1>
          <p className="text-2xl lg:text-3xl font-semibold text-slate-300 mb-6">
            Precision Trial Matching Powered by Clinical Intelligence.
          </p>

          <p className="text-slate-400 text-base leading-relaxed max-w-xl mb-10">
            Instantly parse pathology and NGS reports, structure complex biomarker
            profiles, and match oncology patients directly to active
            ClinicalTrials.gov protocols.
          </p>

          {/* Feature cards row */}
          <div className="grid gap-4 sm:grid-cols-3">
            {FEATURES.map((feature, i) => (
              <div
                key={feature.title}
                className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl"
                style={entrance(80 + i * 60)}
              >
                <p className="text-sm font-semibold text-white mb-1">
                  <span aria-hidden="true" className="mr-1.5">
                    {feature.icon}
                  </span>
                  {feature.title}
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right column — access portal card */}
        <div className="lg:col-span-5" style={entrance(160)}>
          <div className="bg-slate-900/90 border border-slate-800 backdrop-blur-2xl rounded-2xl p-8 shadow-2xl shadow-blue-950/30 max-w-md w-full ml-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                <Dna className="w-5.5 h-5.5 text-blue-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">Aethel Bio Workspace</p>
                <p className="text-xs text-slate-400 mt-1">
                  Sign in to launch the precision trial matching suite.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onSignIn}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/30 mt-6 cursor-pointer active:scale-[0.97]"
            >
              Sign In to Account →
            </button>

            <p className="text-slate-500 text-xs text-center mt-6 block">
              🔒 Encrypted Clinical Environment • US East Node
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
