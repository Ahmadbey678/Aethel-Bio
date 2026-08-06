import { useEffect, useRef } from "react";

/* ============================================================
   ParticleBackground — minimal "data network" backdrop for the
   Auth Landing (LockScreen).

   A canvas-driven generative visualization:
   • A cloud of very tiny monochrome (cool cyan) points of light
     distributed through a soft 3D volume.
   • Nearby points are joined by a web of nearly invisible,
     ultra-thin, faintly glowing lines — a neural-matrix /
     synaptic-map topology.
   • The whole network rotates very slowly about the vertical
     axis, tilts gently, and breathes with a slow global pulse.
     Abstract, non-distracting, unhurried.
   • Trial badges (protocol IDs + phase tags) surface from the
     network and settle into a monochrome column on the right,
     matching the minimal aesthetic.

   Performance: precomputed topology, batched strokes / sprites,
   additive blending, DPR capping, and a full pause when the tab
   is hidden. Under `prefers-reduced-motion` a single static
   frame is drawn instead of an animation loop.
   ============================================================ */

const CYAN = { r: 130, g: 216, b: 250 }; // monochrome cool cyan
const INK = { r: 218, g: 235, b: 252 };  // pale ice for badge text

const PROTOCOLS: ReadonlyArray<{ id: string; tag: string }> = [
  { id: "NCT04267848", tag: "PHASE 2" },
  { id: "NCT05160584", tag: "RECRUITING" },
  { id: "NCT04750737", tag: "PHASE 3" },
  { id: "NCT04487093", tag: "BIOMARKER" },
  { id: "NCT05036070", tag: "IO COMBO" },
  { id: "NCT03854474", tag: "TKI" },
  { id: "NCT04191135", tag: "PHASE 1" },
];

const ROT_SPEED = 0.055; // rad/s → one full turn ≈ 114 s
const TILT_BASE = 0.16;
const TILT_SWAY = 0.05;
const TILT_RATE = 0.09;
const GLOBAL_PULSE_RATE = 0.5;
const LINK_FRAC = 0.17; // link distance as a fraction of cloud radius
const LINK_MAX_PER_NODE = 3;
const NODE_ALPHA_BUCKETS = 8;

const MAX_SLOTS = 4;
const BADGE_HEIGHT = 34;
const SLOT_GAP = 46;
const SLOT_TOP_OFFSET = 70;

interface NetworkNode {
  x: number;
  y: number;
  z: number;
  phase: number;
  rate: number;
  amp: number;
  r: number;
}

interface NetworkLink {
  a: number;
  b: number;
  d: number;
}

interface Badge {
  id: string;
  tag: string;
  x: number;
  y: number;
  alpha: number;
  state: "in" | "hold" | "out";
  age: number;
  hold: number;
  w: number;
}

interface Slot {
  delay: number;
  badge: Badge | null;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const rgba = (c: { r: number; g: number; b: number }, a: number) =>
  `rgba(${c.r},${c.g},${c.b},${a})`;

/* Pre-render one soft radial "light" sprite (monochrome, cyan-tinted)
   once; the loop only ever blits it with drawImage. */
function makeDotSprite(): HTMLCanvasElement | null {
  const size = 24;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  if (!g) return null;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, rgba(CYAN, 1));
  grad.addColorStop(0.35, rgba(CYAN, 0.5));
  grad.addColorStop(1, rgba(CYAN, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
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

/* ── Generative network ──────────────────────────────────────
   Nodes are scattered through a soft 3D volume (slightly
   center-weighted, flattened vertically). Links connect nearby
   nodes, capped per node, so the topology reads as a sparse
   neural web rather than a solid mesh. */
function buildNetwork(w: number, h: number) {
  const cloudR = Math.hypot(w, h) * 0.42;
  const count = clamp(Math.round((w * h) / 720), 900, 2600);
  const linkDist = cloudR * LINK_FRAC;

  const nodes: NetworkNode[] = [];
  for (let i = 0; i < count; i++) {
    const r = cloudR * Math.pow(Math.random(), 0.66);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    nodes.push({
      x: r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.cos(phi) * 0.86,
      z: r * Math.sin(phi) * Math.sin(theta),
      phase: Math.random() * Math.PI * 2,
      rate: 0.35 + Math.random() * 0.65,
      amp: 0.16 + Math.random() * 0.4,
      r: 0.55 + Math.random() * 0.75,
    });
  }

  /* Spatial hash keeps the neighbour search roughly linear */
  const half = cloudR + linkDist;
  const cell = linkDist;
  const cols = Math.ceil((half * 2) / cell) + 1;
  const key = (x: number, y: number, z: number) =>
    (Math.floor((x + half) / cell) * cols + Math.floor((y + half) / cell)) * cols +
    Math.floor((z + half) / cell);

  const cells = new Map<number, number[]>();
  nodes.forEach((nd, i) => {
    const k = key(nd.x, nd.y, nd.z);
    const bucket = cells.get(k);
    if (bucket) bucket.push(i);
    else cells.set(k, [i]);
  });

  const links: NetworkLink[] = [];
  const perNode = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    if (perNode[i] >= LINK_MAX_PER_NODE) continue;
    const nd = nodes[i];
    const gx = Math.floor((nd.x + half) / cell);
    const gy = Math.floor((nd.y + half) / cell);
    const gz = Math.floor((nd.z + half) / cell);
    const cands: Array<[number, number]> = [];

    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let oz = -1; oz <= 1; oz++) {
          const k = ((gx + ox) * cols + (gy + oy)) * cols + (gz + oz);
          const bucket = cells.get(k);
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i || perNode[j] >= LINK_MAX_PER_NODE) continue;
            const m = nodes[j];
            const d = Math.hypot(m.x - nd.x, m.y - nd.y, m.z - nd.z);
            if (d <= linkDist) cands.push([j, d]);
          }
        }
      }
    }

    cands.sort((a, b) => a[1] - b[1]);
    const room = LINK_MAX_PER_NODE - perNode[i];
    for (let c = 0; c < Math.min(room, cands.length); c++) {
      const j = cands[c][0];
      if (perNode[j] >= LINK_MAX_PER_NODE) continue;
      links.push({ a: i, b: j, d: cands[c][1] });
      perNode[i]++;
      perNode[j]++;
      if (perNode[i] >= LINK_MAX_PER_NODE) break;
    }
  }

  return { nodes, links, cloudR, linkDist };
}

function pickProtocol() {
  return PROTOCOLS[Math.floor(Math.random() * PROTOCOLS.length)];
}

/* Monochrome trial badge: thin cyan outline, a medical crosshair
   glyph, the protocol ID and a muted phase tag. No gold, no LEDs. */
function drawBadge(ctx: CanvasRenderingContext2D, badge: Badge) {
  const bw = badge.w;
  const bh = BADGE_HEIGHT;
  ctx.save();
  ctx.globalAlpha = clamp(badge.alpha, 0, 1);

  pathRoundRect(ctx, -bw / 2, -bh / 2, bw, bh, 6);
  ctx.fillStyle = "rgba(6,11,24,0.62)";
  ctx.fill();
  ctx.strokeStyle = rgba(CYAN, 0.26);
  ctx.lineWidth = 1;
  ctx.stroke();

  /* Crosshair glyph */
  const gx = -bw / 2 + 15;
  ctx.strokeStyle = rgba(CYAN, 0.8);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(gx - 4.5, 0);
  ctx.lineTo(gx + 4.5, 0);
  ctx.moveTo(gx, -4.5);
  ctx.lineTo(gx, 4.5);
  ctx.stroke();
  ctx.fillStyle = rgba(CYAN, 0.9);
  ctx.beginPath();
  ctx.arc(gx, 0, 1.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = rgba(INK, 0.92);
  ctx.font = "600 10px ui-monospace, \"SF Mono\", Menlo, Consolas, monospace";
  ctx.fillText(badge.id, -bw / 2 + 26, -6);
  ctx.fillStyle = rgba(CYAN, 0.6);
  ctx.font = "600 7px ui-monospace, \"SF Mono\", Menlo, Consolas, monospace";
  ctx.fillText(badge.tag, -bw / 2 + 26, 9);

  /* Trailing data dot */
  ctx.fillStyle = rgba(CYAN, 0.7);
  ctx.beginPath();
  ctx.arc(bw / 2 - 9, 0, 1.4, 0, Math.PI * 2);
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

    const sprite = makeDotSprite();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = window.innerWidth;
    let h = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    let net = buildNetwork(w, h);
    let { cloudR, linkDist } = net;
    let fov = cloudR * 2.6;
    let badgeW = w < 640 ? 124 : 168;
    let columnX = w - badgeW / 2 - (w < 640 ? 10 : 22);

    let pxs = new Float64Array(net.nodes.length);
    let pys = new Float64Array(net.nodes.length);
    let pers = new Float64Array(net.nodes.length);

    let slots: Slot[] = [];
    const initSlots = () => {
      slots = Array.from({ length: MAX_SLOTS }, (_, i) => ({
        delay: 1.2 + Math.random() * 3.2,
        badge: null,
        y: h * 0.5 - SLOT_TOP_OFFSET + i * SLOT_GAP,
      }));
    };
    initSlots();

    const lineBuckets: number[][] = Array.from({ length: 5 }, () => []);
    const dotBuckets: number[][] = Array.from({ length: NODE_ALPHA_BUCKETS }, () => []);

    let raf = 0;
    let last = performance.now();
    let time = 0;
    let rotY = 0.35;

    const onResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      net = buildNetwork(w, h);
      cloudR = net.cloudR;
      linkDist = net.linkDist;
      fov = cloudR * 2.6;
      badgeW = w < 640 ? 124 : 168;
      columnX = w - badgeW / 2 - (w < 640 ? 10 : 22);
      pxs = new Float64Array(net.nodes.length);
      pys = new Float64Array(net.nodes.length);
      pers = new Float64Array(net.nodes.length);
      initSlots();
    };

    const render = (t: number, rot: number, drawBadges: boolean) => {
      const tilt = TILT_BASE + Math.sin(t * TILT_RATE) * TILT_SWAY;
      const cosY = Math.cos(rot);
      const sinY = Math.sin(rot);
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);
      const fade = Math.min(1, t / 1.6);
      const globalPulse = 0.72 + 0.28 * Math.sin(t * GLOBAL_PULSE_RATE);
      const cx = w / 2;
      const cy = h / 2;
      const nodes = net.nodes;
      const n = nodes.length;

      /* Project every node once per frame */
      for (let i = 0; i < n; i++) {
        const nd = nodes[i];
        const x1 = nd.x * cosY + nd.z * sinY;
        const z1 = -nd.x * sinY + nd.z * cosY;
        const y1 = nd.y * cosT - z1 * sinT;
        const z2 = nd.y * sinT + z1 * cosT;
        const p = fov / (fov + z2);
        pxs[i] = cx + x1 * p;
        pys[i] = cy + y1 * p;
        pers[i] = p;
      }

      /* Nearly-invisible web of lines, batched by faintness */
      const links = net.links;
      for (const b of lineBuckets) b.length = 0;
      for (let li = 0; li < links.length; li++) {
        const L = links[li];
        const depth = 0.55 + 0.45 * ((pers[L.a] + pers[L.b]) / 2 - 0.72) / 0.91;
        const alpha = 0.055 * (1 - 0.5 * (L.d / linkDist)) * depth * globalPulse * fade;
        if (alpha <= 0.005) continue;
        lineBuckets[Math.min(4, Math.floor(alpha / 0.024))].push(li);
      }
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 0.6;
      ctx.lineCap = "round";
      for (let b = 0; b < 5; b++) {
        const segs = lineBuckets[b];
        if (segs.length === 0) continue;
        ctx.strokeStyle = rgba(CYAN, 0.012 + b * 0.024);
        ctx.beginPath();
        for (const li of segs) {
          const L = links[li];
          ctx.moveTo(pxs[L.a], pys[L.a]);
          ctx.lineTo(pxs[L.b], pys[L.b]);
        }
        ctx.stroke();
      }

      /* Very tiny points of light, bucketed by brightness */
      for (const b of dotBuckets) b.length = 0;
      for (let i = 0; i < n; i++) {
        const a = clamp(0.16 + 0.5 * ((pers[i] - 0.72) / 0.91), 0.05, 0.85) * globalPulse * fade;
        dotBuckets[Math.min(NODE_ALPHA_BUCKETS - 1, Math.floor(a / 0.11))].push(i);
      }
      if (sprite) {
        for (let b = 0; b < NODE_ALPHA_BUCKETS; b++) {
          const ids = dotBuckets[b];
          if (ids.length === 0) continue;
          ctx.globalAlpha = 0.04 + b * 0.105;
          for (const i of ids) {
            const nd = nodes[i];
            const pulse = 1 + nd.amp * Math.sin(t * nd.rate + nd.phase);
            const s = Math.max(0.7, nd.r * 2.4 * pers[i] * pulse);
            ctx.drawImage(sprite, pxs[i] - s / 2, pys[i] - s / 2, s, s);
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      /* Monochrome trial badges */
      if (drawBadges) {
        for (const s of slots) if (s.badge) drawBadge(ctx, s.badge);
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      time += dt;
      rotY += dt * ROT_SPEED;

      /* Badge lifecycle: surface from the network, hold, retire */
      for (let i = 0; i < MAX_SLOTS; i++) {
        const s = slots[i];
        if (!s.badge) {
          s.delay -= dt;
          if (s.delay <= 0) {
            const p = pickProtocol();
            s.badge = {
              id: p.id,
              tag: p.tag,
              x: columnX + 26,
              y: s.y,
              alpha: 0,
              state: "in",
              age: 0,
              hold: 4.5 + Math.random() * 2.5,
              w: badgeW,
            };
          }
          continue;
        }
        const b = s.badge;
        if (b.state === "in") {
          b.age += dt;
          b.alpha = Math.min(1, b.age / 0.7);
          b.x = columnX + 26 * (1 - b.alpha);
          if (b.alpha >= 1) {
            b.state = "hold";
            b.age = 0;
          }
        } else if (b.state === "hold") {
          b.age += dt;
          if (b.age >= b.hold) b.state = "out";
        } else {
          b.alpha -= dt / 0.7;
          if (b.alpha <= 0) {
            s.badge = null;
            s.delay = 2.4 + Math.random() * 4;
          }
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      render(time, rotY, true);
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
      ctx.clearRect(0, 0, w, h);
      render(1.6, 0.35, false);
    } else {
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
