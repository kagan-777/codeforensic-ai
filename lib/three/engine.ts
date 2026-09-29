// Tiny 3D helper for <canvas> scenes: rotate, project and flat-shade simple
// meshes. Browser-safe, no dependencies. Y points up, the camera looks along +Z.

export type V3 = [number, number, number];
export type RGB = [number, number, number];

export interface Camera {
  yaw: number; // rotation around Y (radians)
  pitch: number; // rotation around X (radians)
  dist: number; // perspective strength (bigger = flatter)
  scale: number; // pixels per world unit
  cx: number; // screen centre
  cy: number;
}

export interface Projected {
  x: number;
  y: number;
  z: number; // depth after rotation (bigger = further away)
  s: number; // perspective scale
}

export interface Palette {
  accent: RGB;
  violet: RGB;
  high: RGB;
  medium: RGB;
  low: RGB;
  text: RGB;
  line: RGB;
  surface: RGB;
}

export function rotate([x, y, z]: V3, yaw: number, pitch: number): V3 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = x * cy - z * sy;
  const z1 = x * sy + z * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
}

export function project(v: V3, cam: Camera): Projected {
  const [x, y, z] = rotate(v, cam.yaw, cam.pitch);
  const s = cam.dist / (cam.dist + z);
  return { x: cam.cx + x * cam.scale * s, y: cam.cy - y * cam.scale * s, z, s };
}

export const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const shade = (c: RGB, k: number): RGB => [
  Math.min(255, c[0] * k),
  Math.min(255, c[1] * k),
  Math.min(255, c[2] * k),
];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function hexToRgb(hex: string, fallback: RGB): RGB {
  const h = hex.trim().replace("#", "");
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(h)) return fallback;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Reads the theme colours defined in app/globals.css. */
export function readPalette(): Palette {
  const css = typeof window === "undefined" ? null : getComputedStyle(document.documentElement);
  const get = (name: string, fb: RGB) => (css ? hexToRgb(css.getPropertyValue(name), fb) : fb);
  return {
    accent: get("--color-accent", [46, 230, 197]),
    violet: get("--color-violet", [139, 123, 255]),
    high: get("--color-high", [255, 93, 108]),
    medium: get("--color-medium", [255, 181, 71]),
    low: get("--color-low", [92, 184, 255]),
    text: get("--color-text", [232, 238, 248]),
    line: get("--color-line", [29, 41, 64]),
    surface: get("--color-surface-2", [18, 26, 43]),
  };
}

// ------------------------------------------------------------------ meshes --

export interface Face {
  pts: V3[];
  color: RGB;
  alpha?: number;
  edge?: RGB; // outline colour (optional)
  glow?: number; // 0..1 shadow glow
  /** Decals (like a keyhole on a shield) that must be drawn after everything else, in order. */
  overlay?: number;
}

/** Axis-aligned box centred at (cx, cy, cz). */
export function box(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: RGB, extra: Partial<Face> = {}): Face[] {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const q = (...pts: V3[]): Face => ({ pts, color, ...extra });
  return [
    q([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]), // front
    q([x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]), // back
    q([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]), // top
    q([x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0]), // bottom
    q([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]), // left
    q([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]), // right
  ];
}

/** Extrudes a 2D outline (in the XY plane) into a solid with front/back/sides. */
export function extrude(outline: [number, number][], depth: number, color: RGB, extra: Partial<Face> = {}): Face[] {
  const zf = -depth / 2;
  const zb = depth / 2;
  const faces: Face[] = [
    { pts: outline.map(([x, y]) => [x, y, zf] as V3), color, ...extra },
    { pts: outline.map(([x, y]) => [x, y, zb] as V3).reverse(), color, ...extra },
  ];
  for (let i = 0; i < outline.length; i++) {
    const [ax, ay] = outline[i];
    const [bx, by] = outline[(i + 1) % outline.length];
    faces.push({ pts: [[ax, ay, zf], [bx, by, zf], [bx, by, zb], [ax, ay, zb]], color, ...extra });
  }
  return faces;
}

const LIGHT: V3 = (() => {
  const l: V3 = [-0.4, 0.7, -0.6];
  const n = Math.hypot(...l);
  return [l[0] / n, l[1] / n, l[2] / n];
})();

/**
 * Draws faces back-to-front (painter's algorithm) with simple flat lighting.
 * Works for the small convex-ish meshes used in these scenes.
 */
export function drawFaces(ctx: CanvasRenderingContext2D, faces: Face[], cam: Camera) {
  const items = faces.map((f) => {
    const rot = f.pts.map((p) => rotate(p, cam.yaw, cam.pitch));
    const pr = f.pts.map((p) => project(p, cam));
    // normal from the rotated points; flip it towards the camera so winding order doesn't matter
    const [a, b, c] = rot;
    const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n) || 1;
    n = [n[0] / len, n[1] / len, n[2] / len];
    if (n[2] > 0) n = [-n[0], -n[1], -n[2]];
    const light = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    const depth = rot.reduce((s, p) => s + p[2], 0) / rot.length;
    return { f, pr, k: 0.45 + 0.75 * light, depth };
  });
  // Far faces first; overlay decals last (in their overlay order).
  items.sort((p, q) => (p.f.overlay ?? 0) - (q.f.overlay ?? 0) || q.depth - p.depth);

  for (const { f, pr, k } of items) {
    ctx.beginPath();
    pr.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    if (f.glow) {
      ctx.shadowColor = rgba(f.color, 0.8);
      ctx.shadowBlur = 18 * f.glow;
    }
    ctx.fillStyle = rgba(shade(f.color, k), f.alpha ?? 1);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (f.edge) {
      ctx.strokeStyle = rgba(f.edge, 0.55);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

/** Soft radial glow behind a scene. */
export function halo(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c1: RGB, c2: RGB) {
  const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
  g.addColorStop(0, rgba(c1, 0.16));
  g.addColorStop(0.55, rgba(c2, 0.06));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Deterministic pseudo-random number in [0, 1) for index i (same result every render). */
export const seeded = (i: number) => (((i * 9301 + 49297) % 233280) + 233280) % 233280 / 233280;
