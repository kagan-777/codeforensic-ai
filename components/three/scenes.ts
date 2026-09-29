// The 3D scenes used across the app. Each scene is a factory: it builds its
// state once and returns a function that draws a single frame.
// All numbers shown come from real data passed in by the page.

import {
  box,
  drawFaces,
  extrude,
  halo,
  mix,
  project,
  rgba,
  seeded,
  type Camera,
  type Face,
  type RGB,
  type V3,
} from "@/lib/three/engine";
import type { Frame, Renderer, SceneFactory } from "./useCanvasScene";

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

function camera(w: number, h: number, yaw: number, pitch: number, zoom = 0.36, dist = 3.2): Camera {
  return { yaw, pitch, dist, scale: Math.min(w, h) * zoom, cx: w / 2, cy: h / 2 };
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, glow = 0, glowColor = color) {
  if (glow) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.3, r), 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

/** Projects a circle (in a tilted plane) and strokes it with depth-based alpha. */
function ring(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  radius: number,
  tiltX: number,
  tiltZ: number,
  color: RGB,
  width = 1,
  alpha = 0.6,
  y = 0,
) {
  const seg = 72;
  let prev: ReturnType<typeof project> | null = null;
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    const p = tiltPoint([Math.cos(a) * radius, y, Math.sin(a) * radius], tiltX, tiltZ);
    const pr = project(p, cam);
    if (prev) {
      const front = 1 - (prev.z + pr.z + 2) / 4; // 0 back .. 1 front
      ctx.strokeStyle = rgba(color, alpha * (0.25 + 0.75 * front));
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pr.x, pr.y);
      ctx.stroke();
    }
    prev = pr;
  }
}

function tiltPoint([x, y, z]: V3, tiltX: number, tiltZ: number): V3 {
  const cx = Math.cos(tiltX), sx = Math.sin(tiltX);
  const y1 = y * cx - z * sx;
  const z1 = y * sx + z * cx;
  const cz = Math.cos(tiltZ), sz = Math.sin(tiltZ);
  return [x * cz - y1 * sz, x * sz + y1 * cz, z1];
}

// ------------------------------------------------------------------ SHIELD --
/** Login: a 3D security shield with a keyhole and orbiting particles. */
export const shieldScene: SceneFactory = (pal) => {
  const outline: [number, number][] = [
    [-0.8, 0.82], [-0.42, 0.95], [0, 0.84], [0.42, 0.95], [0.8, 0.82],
    [0.8, 0.2], [0.7, -0.25], [0.47, -0.62], [0.22, -0.88], [0, -1.02],
    [-0.22, -0.88], [-0.47, -0.62], [-0.7, -0.25], [-0.8, 0.2],
  ];
  const body = extrude(outline, 0.28, mix(pal.surface, pal.accent, 0.35), { edge: pal.accent });
  const inset: Face = {
    pts: outline.map(([x, y]) => [x * 0.78, y * 0.78 + 0.02, -0.15] as V3),
    color: mix(pal.surface, pal.violet, 0.25),
    edge: pal.accent,
    overlay: 1,
  };
  const keyhole: Face[] = [];
  const circle: V3[] = [];
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    circle.push([Math.cos(a) * 0.15, 0.22 + Math.sin(a) * 0.15, -0.16]);
  }
  keyhole.push({ pts: circle, color: pal.accent, glow: 0.8, overlay: 2 });
  keyhole.push({ pts: [[-0.07, 0.12, -0.16], [0.07, 0.12, -0.16], [0.11, -0.32, -0.16], [-0.11, -0.32, -0.16]], color: pal.accent, glow: 0.8, overlay: 2 });
  const particles = Array.from({ length: 46 }, (_, i) => ({ a: seeded(i) * Math.PI * 2, r: 1.3 + seeded(i + 99) * 0.25, sp: 0.25 + seeded(i + 7) * 0.35 }));

  return ({ ctx, w, h, t }: Frame) => {
    const cam = camera(w, h, Math.sin(t * 0.6) * 0.55, 0.12 + Math.sin(t * 0.4) * 0.06, 0.34);
    halo(ctx, w / 2, h / 2, Math.min(w, h) * 0.55, pal.accent, pal.violet);
    const pts = particles.map((p) => {
      const a = p.a + t * p.sp;
      return project(tiltPoint([Math.cos(a) * p.r, 0, Math.sin(a) * p.r], 1.2, 0.35), cam);
    });
    const drawParticles = (back: boolean) =>
      pts.forEach((p) => {
        if (back === p.z > 0) dot(ctx, p.x, p.y, 1.6 * p.s, rgba(back ? pal.violet : pal.accent, back ? 0.45 : 0.9), back ? 0 : 8);
      });
    drawParticles(true);
    drawFaces(ctx, [...body, inset, ...keyhole], cam);
    // scan line sweeping over the shield
    const sy = Math.sin(t * 1.2) * 0.85;
    const a = project([-0.75, sy, -0.2], cam);
    const b = project([0.75, sy, -0.2], cam);
    ctx.strokeStyle = rgba(pal.accent, 0.8);
    ctx.lineWidth = 2;
    ctx.shadowColor = rgba(pal.accent, 1);
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    drawParticles(false);
  };
};

// ------------------------------------------------------------------- HELIX --
/** Signup: a rotating double helix — a new identity being created. */
export const helixScene: SceneFactory = (pal) => {
  const N = 44;
  return ({ ctx, w, h, t }: Frame) => {
    const cam = camera(w, h, t * 0.5, 0.25, 0.3);
    halo(ctx, w / 2, h / 2, Math.min(w, h) * 0.55, pal.violet, pal.accent);
    type P = { x: number; y: number; z: number; s: number; c: RGB };
    const items: (P & { kind: "dot" } | { kind: "rung"; a: P; b: P; z: number })[] = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const y = -1.15 + 2.3 * u;
      const ang = u * Math.PI * 4;
      const A = project([Math.cos(ang) * 0.55, y, Math.sin(ang) * 0.55], cam);
      const B = project([Math.cos(ang + Math.PI) * 0.55, y, Math.sin(ang + Math.PI) * 0.55], cam);
      const pa = { ...A, c: pal.accent };
      const pb = { ...B, c: pal.violet };
      items.push({ kind: "dot", ...pa }, { kind: "dot", ...pb });
      if (i % 2 === 0) items.push({ kind: "rung", a: pa, b: pb, z: (A.z + B.z) / 2 });
    }
    items.sort((p, q) => q.z - p.z);
    const pulse = (t * 0.6) % 1; // a bright pulse travelling up the helix
    for (const it of items) {
      if (it.kind === "rung") {
        const g = ctx.createLinearGradient(it.a.x, it.a.y, it.b.x, it.b.y);
        g.addColorStop(0, rgba(pal.accent, 0.35));
        g.addColorStop(1, rgba(pal.violet, 0.35));
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(it.a.x, it.a.y);
        ctx.lineTo(it.b.x, it.b.y);
        ctx.stroke();
      } else {
        const front = 1 - (it.z + 1) / 2;
        const yNorm = (h / 2 - it.y) / (Math.min(w, h) * 0.3 * 2.3) + 0.5;
        const hot = Math.max(0, 1 - Math.abs(yNorm - pulse) * 10);
        dot(ctx, it.x, it.y, (2 + front * 2.2 + hot * 2) * it.s, rgba(mix(it.c, pal.text, hot * 0.6), 0.35 + front * 0.65), 6 + hot * 14, rgba(it.c, 0.9));
      }
    }
  };
};

// ------------------------------------------------------------------ TOWERS --
/** Dashboard: 3D bars whose heights are the real HIGH / MEDIUM / LOW counts. */
export function towersScene(data: { high: number; medium: number; low: number }): SceneFactory {
  return (pal) => {
    const values = [data.high, data.medium, data.low];
    const colors = [pal.high, pal.medium, pal.low];
    const labels = ["HIGH", "MED", "LOW"];
    const max = Math.max(1, ...values);
    return ({ ctx, w, h, t }: Frame) => {
      const cam = camera(w, h, -0.55 + Math.sin(t * 0.35) * 0.3, 0.42, 0.3, 4);
      cam.cy = h * 0.58;
      halo(ctx, w / 2, h * 0.55, Math.min(w, h) * 0.6, pal.accent, pal.violet);
      const grow = ease(t / 1.4);
      const faces: Face[] = [...box(0, -0.88, 0, 3.1, 0.06, 1.5, pal.surface, { edge: pal.line })];
      // grid lines on the platform
      const tops: { v: number; top: V3; base: V3; c: RGB; label: string }[] = [];
      values.forEach((v, i) => {
        const hgt = (0.12 + 1.5 * (v / max)) * grow;
        const x = -0.95 + i * 0.95;
        faces.push(...box(x, -0.85 + hgt / 2, 0, 0.52, hgt, 0.52, colors[i], { edge: mix(colors[i], pal.text, 0.4), glow: v > 0 ? 0.35 : 0 }));
        tops.push({ v, top: [x, -0.85 + hgt + 0.12, 0], base: [x, -0.95, -0.55], c: colors[i], label: labels[i] });
      });
      drawFaces(ctx, faces, cam);
      ctx.textAlign = "center";
      for (const tp of tops) {
        const p = project(tp.top, cam);
        ctx.font = `600 ${Math.max(11, Math.min(w, h) * 0.06)}px ui-monospace, monospace`;
        ctx.fillStyle = rgba(tp.c, 1);
        ctx.fillText(String(Math.round(tp.v * grow)), p.x, p.y);
        const q = project(tp.base, cam);
        ctx.font = `600 ${Math.max(9, Math.min(w, h) * 0.035)}px ui-monospace, monospace`;
        ctx.fillStyle = rgba(pal.text, 0.6);
        ctx.fillText(tp.label, q.x, q.y + 14);
      }
    };
  };
}

// ------------------------------------------------------------------- CUBES --
/** Projects list: one floating cube per project (up to 9), linked like a network. */
export function cubesScene(data: { count: number }): SceneFactory {
  return (pal) => {
    const n = Math.max(1, Math.min(9, data.count || 1));
    const cols = Math.ceil(Math.sqrt(n));
    const cells = Array.from({ length: n }, (_, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      return { x: (c - (cols - 1) / 2) * 0.75, z: (r - (Math.ceil(n / cols) - 1) / 2) * 0.75, ph: seeded(i) * 6 };
    });
    return ({ ctx, w, h, t }: Frame) => {
      const cam = camera(w, h, t * 0.28, 0.55, 0.34, 4);
      halo(ctx, w / 2, h / 2, Math.min(w, h) * 0.6, pal.violet, pal.accent);
      const centers: V3[] = cells.map((c) => [c.x, Math.sin(t * 1.2 + c.ph) * 0.12, c.z]);
      // links between neighbours
      ctx.lineWidth = 1;
      for (let i = 0; i < centers.length; i++) {
        for (let j = i + 1; j < centers.length; j++) {
          const d = Math.hypot(centers[i][0] - centers[j][0], centers[i][2] - centers[j][2]);
          if (d > 0.8) continue;
          const a = project(centers[i], cam);
          const b = project(centers[j], cam);
          ctx.strokeStyle = rgba(pal.accent, 0.25);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      const faces: Face[] = [];
      centers.forEach((c, i) => {
        const col = i % 2 === 0 ? mix(pal.surface, pal.accent, 0.55) : mix(pal.surface, pal.violet, 0.6);
        faces.push(...box(c[0], c[1], c[2], 0.38, 0.38, 0.38, col, { edge: i % 2 === 0 ? pal.accent : pal.violet }));
      });
      drawFaces(ctx, faces, cam);
    };
  };
}

// ------------------------------------------------------------------- VAULT --
/**
 * Upload page: a wireframe ZIP "vault" with a glowing core. Particles stream in;
 * when a scan is running (UploadProject sends "cf-scan-stage" events) they speed up.
 */
export const vaultScene: SceneFactory = (pal) => {
  let active = false;
  let flash = 0;
  const onStage = (e: Event) => {
    const stage = (e as CustomEvent<string | null>).detail;
    active = !!stage && stage !== "completed";
    if (stage === "completed") flash = 1;
  };
  window.addEventListener("cf-scan-stage", onStage);

  const parts = Array.from({ length: 70 }, (_, i) => ({
    dir: [seeded(i) * 2 - 1, seeded(i + 31) * 2 - 1, seeded(i + 57) * 2 - 1] as V3,
    life: seeded(i + 11),
  }));
  let spin = 0;

  const render: Renderer = ({ ctx, w, h, t, dt }: Frame) => {
    spin += dt * (active ? 1.4 : 0.4);
    flash = Math.max(0, flash - dt * 0.8);
    const cam = camera(w, h, spin, 0.45 + Math.sin(t * 0.5) * 0.05, 0.3, 3.6);
    halo(ctx, w / 2, h / 2, Math.min(w, h) * 0.6, active ? pal.accent : pal.violet, pal.accent);

    // particles flying into the core
    for (const p of parts) {
      p.life -= dt * (active ? 0.9 : 0.25);
      if (p.life <= 0) p.life += 1;
      const len = Math.hypot(...p.dir) || 1;
      const r = 0.2 + p.life * 1.3;
      const pr = project([(p.dir[0] / len) * r, (p.dir[1] / len) * r, (p.dir[2] / len) * r], cam);
      dot(ctx, pr.x, pr.y, (1 + (1 - p.life) * 1.6) * pr.s, rgba(active ? pal.accent : pal.violet, 0.2 + (1 - p.life) * 0.7));
    }

    // glowing core
    const core = project([0, 0, 0], cam);
    const coreColor = flash > 0 ? mix(pal.accent, pal.text, flash) : active ? pal.accent : pal.violet;
    const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, cam.scale * 0.45);
    g.addColorStop(0, rgba(coreColor, 0.95));
    g.addColorStop(0.35, rgba(coreColor, 0.35));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(core.x, core.y, cam.scale * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // wireframe cube + "zipper" line
    const s = 0.62;
    const v: V3[] = [
      [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
      [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s],
    ];
    const e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    const pv = v.map((p) => project(p, cam));
    ctx.lineWidth = 1.6;
    for (const [a, b] of e) {
      const front = 1 - (pv[a].z + pv[b].z + 2) / 4;
      ctx.strokeStyle = rgba(pal.accent, 0.25 + front * 0.65);
      ctx.beginPath();
      ctx.moveTo(pv[a].x, pv[a].y);
      ctx.lineTo(pv[b].x, pv[b].y);
      ctx.stroke();
    }
    const zipTop = project([0, s, -s], cam);
    const zipBot = project([0, -s, -s], cam);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = rgba(pal.text, 0.5);
    ctx.beginPath();
    ctx.moveTo(zipTop.x, zipTop.y);
    ctx.lineTo(zipBot.x, zipBot.y);
    ctx.stroke();
    ctx.setLineDash([]);
    pv.forEach((p) => dot(ctx, p.x, p.y, 2.2 * p.s, rgba(pal.accent, 0.9), 8));
  };
  render.dispose = () => window.removeEventListener("cf-scan-stage", onStage);
  return render;
};

// ------------------------------------------------------------------- RINGS --
/** Project page: one orbit per scan (up to 6) around a core coloured by the latest risk. */
export function ringsScene(data: { scans: number; risk: number }): SceneFactory {
  return (pal) => {
    const n = Math.max(1, Math.min(6, data.scans || 1));
    const coreC = data.risk === 0 ? pal.accent : data.risk <= 20 ? pal.low : data.risk <= 50 ? pal.medium : pal.high;
    const orbits = Array.from({ length: n }, (_, i) => ({
      r: 0.55 + i * 0.2,
      tx: 1.1 + seeded(i) * 0.6,
      tz: (seeded(i + 5) - 0.5) * 0.9,
      sp: 0.5 + seeded(i + 9) * 0.7,
      ph: seeded(i + 3) * 6,
    }));
    return ({ ctx, w, h, t }: Frame) => {
      const cam = camera(w, h, t * 0.2, 0.2, 0.4, 4);
      halo(ctx, w / 2, h / 2, Math.min(w, h) * 0.6, coreC, pal.violet);
      const dots = orbits.map((o, i) => {
        const a = o.ph + t * o.sp;
        const p = project(tiltPoint([Math.cos(a) * o.r, 0, Math.sin(a) * o.r], o.tx, o.tz), cam);
        return { p, c: i === 0 ? pal.accent : pal.violet };
      });
      dots.filter((d) => d.p.z > 0).forEach((d) => dot(ctx, d.p.x, d.p.y, 3 * d.p.s, rgba(d.c, 0.6)));
      orbits.forEach((o, i) => ring(ctx, cam, o.r, o.tx, o.tz, i === 0 ? pal.accent : pal.violet, 1.3, 0.55));
      const c = project([0, 0, 0], cam);
      const R = cam.scale * 0.3;
      const g = ctx.createRadialGradient(c.x - R * 0.3, c.y - R * 0.3, R * 0.1, c.x, c.y, R);
      g.addColorStop(0, rgba(mix(coreC, pal.text, 0.5), 1));
      g.addColorStop(0.6, rgba(coreC, 0.85));
      g.addColorStop(1, rgba(coreC, 0.1));
      ctx.shadowColor = rgba(coreC, 0.9);
      ctx.shadowBlur = 30 + Math.sin(t * 2) * 8;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      dots.filter((d) => d.p.z <= 0).forEach((d) => dot(ctx, d.p.x, d.p.y, 3.4 * d.p.s, rgba(d.c, 1), 12));
    };
  };
}

// -------------------------------------------------------------------- LENS --
/** Finding page: floating "lines of code"; the finding line glows in its severity colour under a lens. */
export function lensScene(data: { severity: "HIGH" | "MEDIUM" | "LOW" }): SceneFactory {
  return (pal) => {
    const sev = data.severity === "HIGH" ? pal.high : data.severity === "MEDIUM" ? pal.medium : pal.low;
    const lines = Array.from({ length: 7 }, (_, i) => ({
      y: 0.9 - i * 0.3,
      indent: [0, 0.18, 0.18, 0.36, 0.18, 0.36, 0][i],
      len: 0.8 + seeded(i + 2) * 0.9,
    }));
    const hit = 3;
    return ({ ctx, w, h, t }: Frame) => {
      const cam = camera(w, h, -0.55 + Math.sin(t * 0.5) * 0.22, 0.22, 0.32, 4);
      halo(ctx, w / 2, h / 2, Math.min(w, h) * 0.6, sev, pal.violet);
      const faces: Face[] = [];
      lines.forEach((l, i) => {
        const x0 = -1 + l.indent;
        const isHit = i === hit;
        const z = isHit ? -0.18 - Math.sin(t * 2) * 0.04 : 0;
        const col = isHit ? sev : mix(pal.surface, pal.accent, 0.25 + seeded(i) * 0.2);
        faces.push(...box(x0 + l.len / 2, l.y, z, l.len, 0.13, 0.1, col, { edge: isHit ? sev : pal.line, glow: isHit ? 0.9 : 0 }));
      });
      drawFaces(ctx, faces, cam);
      // magnifying lens over the finding line
      const target = lines[hit];
      const lx = -1 + target.indent + target.len * (0.5 + Math.sin(t * 0.8) * 0.25);
      const center = project([lx, target.y, -0.5], cam);
      const R = cam.scale * 0.3 * center.s;
      ctx.lineWidth = 3;
      ctx.strokeStyle = rgba(pal.text, 0.85);
      ctx.shadowColor = rgba(sev, 0.8);
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(center.x, center.y, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = rgba(sev, 0.08);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(center.x + R * 0.7, center.y + R * 0.7);
      ctx.lineTo(center.x + R * 1.35, center.y + R * 1.35);
      ctx.stroke();
      ctx.lineCap = "butt";
    };
  };
}
