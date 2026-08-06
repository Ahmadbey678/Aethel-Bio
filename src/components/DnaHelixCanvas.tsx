import { useEffect, useRef } from "react";

/**
 * High-density 2D canvas particle system forming a slowly rotating DNA
 * double helix with a soft drifting cloud around the strands.
 *
 * - Thousands of tiny glowing nodes on two strands (violet + magenta)
 *   with cyan rungs between them, plus a violet/cyan ambient cloud.
 * - Rendered at devicePixelRatio (capped at 2) with additive
 *   'lighter' compositing for a natural glow without blur filters.
 * - Slows to a near-stop under prefers-reduced-motion (fade only).
 * - Pauses when the tab is hidden; redraws on resize.
 */

const TAU = Math.PI * 2;
const PI2 = Math.PI * 2;

type Particle = {
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseY: number;
  ampX: number;
  ampY: number;
  phase: number;
  speed: number;
  size: number;
  alpha: number;
  color: string;
  drift: number;
  driftX: number;
  driftY: number;
};

interface DnaHelixCanvasProps {
  className?: string;
  density?: number;
  reduced?: boolean;
}

export default function DnaHelixCanvas({
  className,
  density = 1,
  reduced = false,
}: DnaHelixCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const g = ctx; // non-null capture for closures

    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motionReduced = reduced || motionMedia.matches;
    const reduce = motionReduced || window.matchMedia("(max-width: 1023px)").matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let running = true;
    let time = 0;
    const particles: Particle[] = [];
    const strands: Array<Array<{ x: number; y: number; color: string; size: number }>> = [];

    // Core helix geometry (logical units, scaled to the canvas at draw time)
    const CORE_W = 720;
    const CORE_H = 900;
    const HELIX_Y = 310;
    const HELIX_H = 780;
    const RADIUS = 170;
    const TURNS = 4.4;
    const CLOUD = 560;
    const CLOUD_TOTAL = Math.floor(1500 * density);

    const V1 = "#8B5CF6";
    const V2 = "#A78BFA";
    const M1 = "#D946EF";
    const M2 = "#F0ABFC";
    const C1 = "#06B6D4";
    const CLOUD_COLORS = [V1, M1, C1];

    function seedParticles() {
      particles.length = 0;
      strands.length = 0;

      const strandA: Array<{ x: number; y: number; color: string; size: number }> = [];
      const strandB: Array<{ x: number; y: number; color: string; size: number }> = [];

      // Helix nodes (two strands + rung midpoint)
      const N = Math.floor(2400 * density);
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const y = HELIX_Y + t * HELIX_H;
        const ang = t * TURNS * TAU;
        const side = i % 2 === 0 ? 1 : -1;
        const jitter = (Math.random() - 0.5) * 10;
        const r = RADIUS * (0.84 + Math.random() * 0.26);

        const xA = Math.cos(ang) * r + jitter;
        const xB = Math.cos(ang + Math.PI) * r + jitter;
        const yJ = y + (Math.random() - 0.5) * 12;
        const wobble = (Math.random() - 0.5) * 4;

        particles.push({
          x: CORE_W / 2 + xA,
          y: yJ + wobble,
          z: Math.sin(ang) * r,
          baseX: CORE_W / 2 + xA,
          baseY: yJ,
          ampX: 5 + Math.random() * 9,
          ampY: 3 + Math.random() * 6,
          phase: Math.random() * PI2,
          speed: 0.12 + Math.random() * 0.16,
          size: 1.5 + Math.random() * 2.3,
          alpha: 0.55 + Math.random() * 0.45,
          color: side === 1 ? V1 : M1,
          drift: 0,
          driftX: 0,
          driftY: 0,
        });

        particles.push({
          x: CORE_W / 2 + xB,
          y: yJ - wobble,
          z: -Math.sin(ang) * r,
          baseX: CORE_W / 2 + xB,
          baseY: yJ,
          ampX: 5 + Math.random() * 9,
          ampY: 3 + Math.random() * 6,
          phase: Math.random() * PI2,
          speed: 0.12 + Math.random() * 0.16,
          size: 1.5 + Math.random() * 2.3,
          alpha: 0.55 + Math.random() * 0.45,
          color: side === 1 ? M1 : V1,
          drift: 0,
          driftX: 0,
          driftY: 0,
        });

        // Rung midpoint (cyan, smaller)
        if (i % 7 === 0) {
          particles.push({
            x: CORE_W / 2,
            y: yJ,
            z: 0,
            baseX: CORE_W / 2,
            baseY: yJ,
            ampX: 5 + Math.random() * 9,
            ampY: 3 + Math.random() * 6,
            phase: Math.random() * PI2,
            speed: 0.12 + Math.random() * 0.16,
            size: 1.2 + Math.random() * 1.4,
            alpha: 0.4 + Math.random() * 0.35,
            color: C1,
            drift: 0,
            driftX: 0,
            driftY: 0,
          });
        }

        if (i % 10 === 0) {
          strandA.push({
            x: CORE_W / 2 + Math.cos(ang) * r,
            y: yJ,
            color: side === 1 ? V2 : M2,
            size: 2.4 + Math.random() * 2.2,
          });
          strandB.push({
            x: CORE_W / 2 + Math.cos(ang + Math.PI) * r,
            y: yJ,
            color: side === 1 ? M2 : V2,
            size: 2.4 + Math.random() * 2.2,
          });
        }
      }
      strands.push(strandA, strandB);

      // Ambient cloud (violet / magenta / cyan)
      for (let i = 0; i < CLOUD_TOTAL; i++) {
        const a = Math.random() * TAU;
        const rr = Math.sqrt(Math.random()) * CLOUD;
        particles.push({
          x: CORE_W / 2 + Math.cos(a) * rr,
          y: CORE_H / 2 + Math.sin(a) * rr * 0.75 - 30,
          z: 0,
          baseX: CORE_W / 2 + Math.cos(a) * rr,
          baseY: CORE_H / 2 + Math.sin(a) * rr * 0.75 - 30,
          ampX: 14 + Math.random() * 30,
          ampY: 10 + Math.random() * 22,
          phase: Math.random() * PI2,
          speed: 0.06 + Math.random() * 0.1,
          size: 0.7 + Math.random() * 1.5,
          alpha: 0.12 + Math.random() * 0.24,
          color: CLOUD_COLORS[i % CLOUD_COLORS.length],
          drift: 0.5 + Math.random() * 0.9,
          driftX: (Math.random() - 0.5) * 40,
          driftY: (Math.random() - 0.5) * 40,
        });
      }
    }

    function resize() {
      const parent = canvas?.parentElement;
      if (!parent) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = parent.clientWidth;
      height = parent.clientHeight;
      if (canvas) {
        canvas.width = Math.max(1, Math.floor(width * dpr));
        canvas.height = Math.max(1, Math.floor(height * dpr));
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      if (!running) return;
      g.clearRect(0, 0, width, height);
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 1;

      // Faint radial glow behind the helix
      const gx = width * 0.62;
      const gy = height * 0.52;
      const grad = g.createRadialGradient(gx, gy, 0, gx, gy, Math.max(width, height) * 0.55);
      grad.addColorStop(0, "rgba(139,92,246,0.06)");
      grad.addColorStop(0.5, "rgba(217,70,239,0.03)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, width, height);

      const sx = width / CORE_W;
      const sy = height / CORE_H;
      const t = time;

      // Strand highlight nodes (drawn per-frame from updated positions)
      for (const strand of strands) {
        for (const s of strand) {
          const px = s.x * sx;
          const py = s.y * sy;
          g.globalAlpha = 0.6;
          g.fillStyle = s.color;
          g.beginPath();
          g.arc(px, py, s.size, 0, TAU);
          g.fill();
        }
      }

      // All particles: slow axial drift + idle breathing
      for (const p of particles) {
        const breathe = 1 + Math.sin(t * 0.0006 + p.phase) * 0.12;
        const driftX =
          Math.sin(t * 0.0001 + p.phase) * p.ampX +
          p.driftX * Math.sin(t * 0.00008 + p.phase) * 0.6;
        const driftY =
          Math.cos(t * 0.00012 + p.phase * 1.3) * p.ampY +
          p.driftY * Math.cos(t * 0.0001 + p.phase) * 0.6;
        const px = (p.baseX + driftX) * sx;
        const py = (p.baseY + driftY) * sy;
        const size = Math.max(0.4, p.size * breathe * sx);
        g.globalAlpha = p.alpha;
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(px, py, size, 0, TAU);
        g.fill();
      }

      // Redraw pass for brighter cores (additive doubling)
      for (const p of particles) {
        if (p.drift > 0.2) continue;
        const driftX =
          Math.sin(t * 0.0001 + p.phase) * p.ampX +
          p.driftX * Math.sin(t * 0.00008 + p.phase) * 0.6;
        const driftY =
          Math.cos(t * 0.00012 + p.phase * 1.3) * p.ampY +
          p.driftY * Math.cos(t * 0.0001 + p.phase) * 0.6;
        const px = (p.baseX + driftX) * sx;
        const py = (p.baseY + driftY) * sy;
        g.globalAlpha = p.alpha * 0.5;
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(px, py, Math.max(0.3, p.size * 0.45), 0, TAU);
        g.fill();
      }

      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";

      if (reduce) {
        running = false;
        return;
      }
      time += 16;
      raf = requestAnimationFrame(draw);
    }

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduce) {
        running = true;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(draw);
      }
    };

    seedParticles();
    resize();
    draw();

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [density, reduced]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label="Rotating particle DNA double helix in violet, magenta and cyan"
    />
  );
}
