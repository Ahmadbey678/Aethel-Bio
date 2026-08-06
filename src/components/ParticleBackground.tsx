import { useEffect, useRef } from "react";

/* ============================================================
   ParticleBackground — "Precision Oncology" data-processing
   backdrop for the Auth Landing (LockScreen).

   A canvas-driven animation:
   • Nucleotide glyphs (A / C / T / G) and small molecular shapes
     drift inward from the edges of the screen.
   • A rotating double-helix sits at the centre and acts as a
     visual "filter".
   • Particles that pass through the helix emerge on the right as
     aligned trial badges (protocol IDs + phase tags).

   Performance is deliberately conservative: pre-rendered glow
   sprites, additive blending, DPR capping, batched strokes, and a
   full pause when the tab is hidden. Under `prefers-reduced-motion`
   a single static frame is drawn instead of an animation loop.
   ============================================================ */

const NUCLEOTIDES = ["A", "C", "T", "G"] as const;

const PALETTE = {
  blue: { r: 82, g: 133, b: 247 },
  cyan: { r: 84, g: 220, b: 199 },
  white: { r: 224, g: 238, b: 255 },
  gold: { r: 228, g: 194, b: 124 },
} as const;

type ColorKey = keyof typeof PALETTE;

const PROTOCOLS: ReadonlyArray<{ id: string; tag: string }> = [
  { id: "NCT04267848", tag: "PHASE 2" },
  { id: "NCT05160584", tag: "RECRUITING" },
  { id: "NCT04750737", tag: "PHASE 3" },
  { id: "NCT04487093", tag: "BIOMARKER" },
  { id: "NCT05036070", tag: "IO COMBO" },
  { id: "NCT03854474", tag: "TKI" },
  { id: "NCT04191135", tag: "PHASE 1" },
];

const MAX_SLOTS = 5;
const BADGE_LIFE = 4.5;
const HELIX_TURNS = 2.3;
const HELIX_SPEED = 0.55;
const SLOT_GAP = 44;
const SLOT_TOP_OFFSET = 92;
const BADGE_HEIGHT = 36;

interface BadgeInfo {
  id: string;
  tag: string;
}

interface Particle {
  kind: "nucleotide" | "molecule";
  letter: string;
  color: ColorKey;
  x: number;
  y: number;
  vx: number;
  vy: number;
  px: number;
  py: number;
  size: number;
  alpha: number;
  wobblePhase: number;
  wobbleAmp: number;
  state: "travel" | "through" | "badge";
  s: number;
  theta: number;
  spinDir: number;
  badge: BadgeInfo | null;
  slot: number;
  tx: number;
  ty: number;
  age: number;
  settled: boolean;
  fading: boolean;
  dead: boolean;
  badgeW: number;
}

interface Layout {
  w: number;
  h: number;
  cx: number;
  cy: number;
  R: number;
  H: number;
  badgeW: number;
  columnX: number;
  target: number;
}

type GlowSprites = Record<ColorKey, HTMLCanvasElement>;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function rgba(c: { r: number; g: number; b: number }, a: number) {
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

/* Pre-render a soft radial glow once; the animation loop only ever
   blits it with drawImage (much cheaper than per-frame gradients). */
function makeGlowSprite(color: ColorKey): HTMLCanvasElement {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  if (g) {
    const { r, g: gr, b } = PALETTE[color];
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${r},${gr},${b},0.9)`);
    grad.addColorStop(0.32, `rgba(${r},${gr},${b},0.3)`);
    grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return c;
}

function computeLayout(w: number, h: number): Layout {
  const H = Math.min(h * 0.54, 400);
  const R = clamp(Math.min(w, h) * 0.075, 34, 88);
  const badgeW = w < 640 ? 120 : 168;
  const columnX = w - badgeW / 2 - (w < 640 ? 10 : 22);
  const target = clamp(Math.round((w * h) / 26000), 30, 85);
  return { w, h, cx: w / 2, cy: h * 0.5, R, H, badgeW, columnX, target };
}

function pathRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* ── Rotating double helix ─────────────────────────────────────
   Both strands are swept top-to-bottom; at each point the strand
   on the right-hand side of the axis counts as "front" (closer to
   the viewer). Segments are collected by depth and drawn in
   back → back-rung → front-rung → front order, which gives the
   classic DNA occlusion without any per-frame sorting. */
function drawHelix(
  ctx: CanvasRenderingContext2D,
  t: number,
  layout: Layout,
  sprites: GlowSprites,
) {
  const { cx, cy, R, H } = layout;
  const phi = t * HELIX_SPEED;
  const steps = 96;
  const rungEvery = 4;
  const backStrand: Array<readonly [number, number, number, number]> = [];
  const frontStrand: Array<readonly [number, number, number, number]> = [];
  const backRungs: Array<readonly [number, number, number, number]> = [];
  const frontRungs: Array<readonly [number, number, number, number]> = [];

  let prevA: readonly [number, number] | null = null;
  let prevB: readonly [number, number] | null = null;

  for (let i = 0; i <= steps; i++) {
    const s = -H / 2 + (H * i) / steps;
    const ang = (s / H) * Math.PI * 2 * HELIX_TURNS + phi;
    const cosA = Math.cos(ang);
    const front = cosA >= 0;
    const xA = cx + R * cosA;
    const xB = cx - R * cosA;
    const y = cy + s;

    if (prevA) {
      const seg: readonly [number, number, number, number] = [prevA[0], prevA[1], xA, y];
      (front ? frontStrand : backStrand).push(seg);
    }
    if (prevB) {
      const seg: readonly [number, number, number, number] = [prevB[0], prevB[1], xB, y];
      (!front ? frontStrand : backStrand).push(seg);
    }
    prevA = [xA, y];
    prevB = [xB, y];

    if (i % rungEvery === 0) {
      const backX = front ? xB : xA;
      const frontX = front ? xA : xB;
      backRungs.push([backX, y, cx, y]);
      frontRungs.push([cx, y, frontX, y]);
    }
  }

  const strokeSegments = (
    segs: Array<readonly [number, number, number, number]>,
    color: string,
    width: number,
  ) => {
    if (segs.length === 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of segs) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  };

  /* Faint axis */
  ctx.strokeStyle = rgba(PALETTE.white, 0.05);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy - H / 2);
  ctx.lineTo(cx, cy + H / 2);
  ctx.stroke();

  /* Back layers → front layers (painter's order for occlusion) */
  strokeSegments(backStrand, rgba(PALETTE.blue, 0.16), 1.2);
  strokeSegments(backRungs, rgba(PALETTE.blue, 0.12), 1);
  strokeSegments(frontRungs, rgba(PALETTE.white, 0.3), 1);

  ctx.globalCompositeOperation = "lighter";
  strokeSegments(frontStrand, rgba(PALETTE.white, 0.1), 5.5);
  ctx.globalCompositeOperation = "source-over";
  strokeSegments(frontStrand, rgba(PALETTE.white, 0.78), 1.5);

  /* Connector nodes at the top / bottom of the axis */
  for (const yy of [cy - H / 2, cy + H / 2]) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.45;
    ctx.drawImage(sprites.white, cx - 14, yy - 14, 28, 28);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = rgba(PALETTE.white, 0.8);
    ctx.beginPath();
    ctx.arc(cx, yy, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function pickProtocol(): BadgeInfo {
  return PROTOCOLS[Math.floor(Math.random() * PROTOCOLS.length)];
}

function spawnParticle(layout: Layout): Particle {
  const roll = Math.random();
  const fromLeft = roll < 0.5;
  const fromTop = roll >= 0.5 && roll < 0.62;
  const x = fromLeft ? -12 : fromTop ? Math.random() * layout.w : layout.w + 12;
  const y = fromLeft ? Math.random() * layout.h : fromTop ? -12 : Math.random() * layout.h;

  const dir = Math.atan2(layout.cy - y, layout.cx - x) + (Math.random() - 0.5) * 0.8;
  const speed = 24 + Math.random() * 30;
  const vx = Math.cos(dir) * speed;
  const vy = Math.sin(dir) * speed;
  const len = Math.hypot(vx, vy) || 1;

  const colorRoll = Math.random();
  const color: ColorKey =
    colorRoll < 0.45 ? "blue" : colorRoll < 0.68 ? "white" : colorRoll < 0.88 ? "cyan" : "gold";

  const kind: Particle["kind"] = Math.random() < 0.68 ? "nucleotide" : "molecule";
  const letter = NUCLEOTIDES[Math.floor(Math.random() * NUCLEOTIDES.length)];
  const size = kind === "nucleotide" ? 9 + Math.random() * 5 : 4 + Math.random() * 3;

  return {
    kind,
    letter,
    color,
    x,
    y,
    vx,
    vy,
    px: -vy / len,
    py: vx / len,
    size,
    alpha: 0.3 + Math.random() * 0.45,
    wobblePhase: Math.random() * Math.PI * 2,
    wobbleAmp: 14 + Math.random() * 26,
    state: "travel",
    s: 0,
    theta: 0,
    spinDir: 1,
    badge: null,
    slot: 0,
    tx: 0,
    ty: 0,
    age: 0,
    settled: false,
    fading: false,
    dead: false,
    badgeW: layout.badgeW,
  };
}

function seedParticles(layout: Layout, count: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const p = spawnParticle(layout);
    p.x = Math.random() * layout.w;
    p.y = Math.random() * layout.h;
    out.push(p);
  }
  return out;
}

function slotY(layout: Layout, slot: number) {
  return layout.cy - SLOT_TOP_OFFSET + slot * SLOT_GAP;
}

/* Advance one particle. When a particle exits the helix (through →
   badge), `claimSlot` is invoked so the caller can assign a column
   slot using its shared counter. */
function updateParticle(
  p: Particle,
  dt: number,
  layout: Layout,
  claimSlot: (p: Particle) => void,
) {
  switch (p.state) {
    case "travel": {
      p.wobblePhase += dt * 2.2;
      const wob = Math.sin(p.wobblePhase) * p.wobbleAmp;
      p.x += (p.vx + p.px * wob) * dt;
      p.y += (p.vy + p.py * wob) * dt;

      const dx = p.x - layout.cx;
      const dy = p.y - layout.cy;
      if (Math.abs(dy) < layout.H / 2 + 34 && Math.abs(dx) < layout.R + 30) {
        /* Enter the filter: orbit the helix axis while travelling along it. */
        p.state = "through";
        p.s = clamp(p.y - layout.cy, -layout.H / 2 + 14, layout.H / 2 - 14);
        p.theta = Math.random() * Math.PI * 2;
        p.spinDir = Math.random() < 0.5 ? 1 : -1;
      } else if (p.x < -40 || p.x > layout.w + 40 || p.y < -40 || p.y > layout.h + 40) {
        p.dead = true;
      }
      break;
    }
    case "through": {
      p.s += p.spinDir * 16 * dt;
      p.theta += p.spinDir * 2.6 * dt;
      p.x = layout.cx + layout.R * 0.92 * Math.cos(p.theta);
      p.y = layout.cy + p.s;

      if (Math.abs(p.s) > layout.H / 2 + 6) {
        /* Emerge from the filter → slide out as an aligned trial badge. */
        p.state = "badge";
        claimSlot(p);
      }
      break;
    }
    case "badge": {
      p.age += dt;
      p.x += (p.tx - p.x) * Math.min(1, 3.2 * dt);
      p.y += (p.ty - p.y) * Math.min(1, 3.2 * dt);
      if (!p.settled && Math.hypot(p.tx - p.x, p.ty - p.y) < 1.5) p.settled = true;
      if (p.settled && p.age > BADGE_LIFE) p.fading = true;
      if (p.fading) {
        p.alpha -= dt * 1.4;
        if (p.alpha <= 0) p.dead = true;
      } else {
        p.alpha = Math.min(1, p.alpha + dt * 3);
      }
      break;
    }
  }
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle, sprites: GlowSprites) {
  const boost = p.state === "through" ? 1.3 : 1;
  const alpha = clamp(p.alpha * boost, 0, 1);

  /* Glow */
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha * 0.7;
  const sz = p.size * 3.2;
  ctx.drawImage(sprites[p.color], p.x - sz, p.y - sz, sz * 2, sz * 2);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;

  if (p.kind === "nucleotide") {
    ctx.font = `600 ${p.size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = rgba(PALETTE.white, alpha);
    ctx.fillText(p.letter, p.x, p.y + 0.5);
  } else {
    /* Minimal molecular motif: a ring with a bonded satellite dot. */
    ctx.strokeStyle = rgba(PALETTE.cyan, alpha * 0.85);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 0.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rgba(PALETTE.cyan, alpha * 0.4);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + p.size * 1.6, p.y - p.size * 0.8);
    ctx.stroke();
    ctx.fillStyle = rgba(PALETTE.white, alpha * 0.9);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
    ctx.arc(p.x + p.size * 1.6, p.y - p.size * 0.8, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBadge(ctx: CanvasRenderingContext2D, p: Particle, sprites: GlowSprites) {
  if (!p.badge) return;
  const bw = p.badgeW;
  const bh = BADGE_HEIGHT;
  const alpha = clamp(p.alpha, 0, 1);
  const pop = Math.min(1, p.age * 4);
  const scale = 0.9 + 0.1 * pop;

  ctx.save();
  ctx.globalAlpha = alpha;

  /* Soft entry glow while the badge pops in */
  if (pop < 1) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = (1 - pop) * 0.25;
    ctx.drawImage(sprites.white, p.x - bw * 0.7, p.y - bh * 0.7, bw * 1.4, bh * 1.4);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = alpha;
  }

  ctx.translate(p.x, p.y);
  ctx.scale(scale, scale);

  pathRoundRect(ctx, -bw / 2, -bh / 2, bw, bh, 6);
  ctx.fillStyle = "rgba(8,13,28,0.66)";
  ctx.fill();
  ctx.strokeStyle = rgba(PALETTE.white, 0.3);
  ctx.lineWidth = 1;
  ctx.stroke();

  /* Gold accent rail */
  ctx.fillStyle = rgba(PALETTE.gold, 0.9);
  ctx.fillRect(-bw / 2 + 1, -bh / 2 + 8, 2, bh - 16);

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  /* Phase tag (gold, equipment-style) */
  ctx.font = "600 8px ui-monospace, \"SF Mono\", Menlo, Consolas, monospace";
  ctx.fillStyle = rgba(PALETTE.gold, 0.95);
  ctx.fillText(p.badge.tag, -bw / 2 + 10, -bh / 2 + 9);

  /* Protocol ID (electric white, mono) */
  ctx.font = "600 11px ui-monospace, \"SF Mono\", Menlo, Consolas, monospace";
  ctx.fillStyle = rgba(PALETTE.white, 1);
  ctx.fillText(p.badge.id, -bw / 2 + 10, bh / 2 - 10);

  /* Teal status LED */
  ctx.fillStyle = rgba(PALETTE.cyan, 1);
  ctx.beginPath();
  ctx.arc(bw / 2 - 9, -bh / 2 + 9, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sprites: GlowSprites = {
      blue: makeGlowSprite("blue"),
      cyan: makeGlowSprite("cyan"),
      white: makeGlowSprite("white"),
      gold: makeGlowSprite("gold"),
    };

    let layout = computeLayout(window.innerWidth, window.innerHeight);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(layout.w * dpr);
    canvas.height = Math.round(layout.h * dpr);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let particles: Particle[] = [];
    let nextSlot = 0;
    let raf = 0;
    let last = performance.now();
    let time = 0;

    /* Assign a rotating column slot; retire whatever badge is parked
       there so the column keeps cycling. */
    const claimSlot = (p: Particle) => {
      p.badge = pickProtocol();
      p.slot = nextSlot;
      nextSlot = (nextSlot + 1) % MAX_SLOTS;
      const occupant = particles.find(
        (q) => q !== p && q.state === "badge" && q.slot === p.slot && !q.fading,
      );
      if (occupant) occupant.fading = true;
      p.badgeW = layout.badgeW;
      p.tx = layout.columnX;
      p.ty = slotY(layout, p.slot);
      p.age = 0;
      p.settled = false;
      p.alpha = 0;
      p.fading = false;
    };

    const onResize = () => {
      layout = computeLayout(window.innerWidth, window.innerHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(layout.w * dpr);
      canvas.height = Math.round(layout.h * dpr);
      for (const p of particles) {
        if (p.state === "badge") {
          p.badgeW = layout.badgeW;
          p.tx = layout.columnX;
          p.ty = slotY(layout, p.slot);
        }
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      time += dt;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, layout.w, layout.h);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      drawHelix(ctx, time, layout, sprites);

      let travelCount = 0;
      for (const p of particles) {
        updateParticle(p, dt, layout, claimSlot);
        if (!p.dead && p.state !== "badge") travelCount++;
      }

      /* Top up the drifting population */
      const deficit = layout.target - travelCount;
      if (deficit > 0 && Math.random() < dt * 5) {
        particles.push(spawnParticle(layout));
      }

      for (const p of particles) {
        if (p.dead) continue;
        if (p.state === "badge") drawBadge(ctx, p, sprites);
        else drawParticle(ctx, p, sprites);
      }

      particles = particles.filter((p) => !p.dead);
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf && !reduced) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    if (reduced) {
      /* Static frame for users who prefer reduced motion */
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, layout.w, layout.h);
      drawHelix(ctx, 0, layout, sprites);
      for (let i = 0; i < layout.target; i++) {
        const p = spawnParticle(layout);
        p.x = layout.cx + (Math.random() - 0.5) * layout.w * 1.05;
        p.y = layout.cy + (Math.random() - 0.5) * layout.h * 1.05;
        drawParticle(ctx, p, sprites);
      }
    } else {
      particles = seedParticles(layout, Math.floor(layout.target * 0.7));
      raf = requestAnimationFrame(frame);
    }

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      role="presentation"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
