"use client";

import { useEffect, useRef } from "react";

/**
 * Animated 3D "code scanner" orb, drawn on a <canvas> with plain math —
 * no 3D library needed. A sphere of code nodes rotates while a scanning ring
 * sweeps through it; some nodes light up red when the scanner passes them
 * (a picture of the analyzer finding risky patterns).
 *
 * - Respects "reduce motion": draws one still frame.
 * - Pauses when the tab is hidden or the orb is off-screen (saves battery).
 * - Purely decorative (aria-hidden).
 */

interface Node3D {
  x: number;
  y: number;
  z: number;
  hot: boolean; // becomes red when scanned
  heat: number; // 0..1 glow after the scanner passes
}

function cssColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export default function ScannerOrb({
  className = "",
  nodes = 240,
  hotRatio = 0.07,
}: {
  className?: string;
  nodes?: number;
  /** Share of nodes that light up red (0 = none). Pages pass a value based on real findings. */
  hotRatio?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const accent = hexToRgb(cssColor("--color-accent", "#2ee6c5"));
    const violet = hexToRgb(cssColor("--color-violet", "#8b7bff"));
    const high = hexToRgb(cssColor("--color-high", "#ff5d6c"));
    const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

    // Evenly spread points on a sphere (Fibonacci sphere). Deterministic "random" for hot nodes.
    const pts: Node3D[] = [];
    for (let i = 0; i < nodes; i++) {
      const y = 1 - (i / (nodes - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = i * Math.PI * (3 - Math.sqrt(5));
      const pseudo = ((i * 9301 + 49297) % 233280) / 233280;
      pts.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r, hot: pseudo < hotRatio, heat: 0 });
    }

    // Connect each node to its 3 nearest neighbours (computed once).
    const edges: [number, number][] = [];
    const seen = new Set<string>();
    for (let i = 0; i < pts.length; i++) {
      const d = pts
        .map((p, j) => ({ j, d: (p.x - pts[i].x) ** 2 + (p.y - pts[i].y) ** 2 + (p.z - pts[i].z) ** 2 }))
        .filter((o) => o.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
      for (const { j } of d) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push([i, j]);
        }
      }
    }

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Resizing clears the canvas, so with "reduce motion" (no animation loop) redraw the still frame.
    const ro = new ResizeObserver(() => {
      resize();
      if (reduceMotion) draw(0);
    });
    ro.observe(canvas);
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(canvas);

    let raf = 0;
    let last = performance.now();
    let t = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (visible && !document.hidden) {
        t += dt;
        draw(dt);
      }
      if (!reduceMotion) raf = requestAnimationFrame(frame);
    };

    const draw = (dt: number) => {
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const R = Math.min(width, height) * 0.36;
      const focal = 2.8;

      const rotY = t * 0.35;
      const tilt = -0.35;
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(tilt);
      const sinX = Math.sin(tilt);
      const scanY = Math.sin(t * 0.9) * 0.95; // scanner height in world space (-1..1)

      // Rotate + project every node.
      const proj = pts.map((p) => {
        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.x * sinY + p.z * cosY;
        const y2 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX;
        const s = focal / (focal + z2);
        return { sx: cx + x1 * R * s, sy: cy + y2 * R * s, z: z2, s, worldY: p.y };
      });

      // Heat up hot nodes as the scanner passes them, then cool down slowly.
      pts.forEach((p) => {
        const near = Math.abs(p.y - scanY) < 0.06;
        if (p.hot && near) p.heat = 1;
        p.heat = Math.max(0, p.heat - dt * 0.25);
      });

      // Outer halo
      const halo = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.6);
      halo.addColorStop(0, rgba(accent, 0.1));
      halo.addColorStop(0.6, rgba(violet, 0.05));
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);

      // Edges (back ones fainter)
      ctx.lineWidth = 1;
      for (const [a, b] of edges) {
        const pa = proj[a];
        const pb = proj[b];
        const depth = (2 - (pa.z + pb.z) / 2) / 3; // ~0.33 (back) .. 1 (front)
        ctx.strokeStyle = rgba(accent, 0.05 + depth * 0.18);
        ctx.beginPath();
        ctx.moveTo(pa.sx, pa.sy);
        ctx.lineTo(pb.sx, pb.sy);
        ctx.stroke();
      }

      // Scanning ring (horizontal slice of the sphere at scanY)
      const ringR = Math.sqrt(Math.max(0, 1 - scanY * scanY));
      ctx.beginPath();
      for (let k = 0; k <= 64; k++) {
        const ang = (k / 64) * Math.PI * 2;
        const x = Math.cos(ang) * ringR;
        const z = Math.sin(ang) * ringR;
        const y2 = scanY * cosX - z * sinX;
        const z2 = scanY * sinX + z * cosX;
        const s = focal / (focal + z2);
        const sx = cx + x * R * s;
        const sy = cy + y2 * R * s;
        if (k === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.strokeStyle = rgba(accent, 0.85);
      ctx.lineWidth = 1.6;
      ctx.shadowColor = rgba(accent, 0.9);
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Nodes, back to front
      const order = proj.map((p, i) => i).sort((a, b) => proj[b].z - proj[a].z);
      for (const i of order) {
        const p = proj[i];
        const n = pts[i];
        const depth = (1 - p.z) / 2; // 0 back .. 1 front
        const nearScan = Math.max(0, 1 - Math.abs(p.worldY - scanY) / 0.12);
        const size = (1.1 + depth * 1.6) * p.s + nearScan * 1.5 + n.heat * 2.2;
        if (n.heat > 0.02) {
          ctx.fillStyle = rgba(high, 0.35 + n.heat * 0.65);
          ctx.shadowColor = rgba(high, 0.9);
          ctx.shadowBlur = 14 * n.heat;
        } else {
          ctx.fillStyle = rgba(nearScan > 0 ? accent : violet, 0.25 + depth * 0.55 + nearScan * 0.3);
          ctx.shadowBlur = 0;
        }
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    };

    if (reduceMotion) {
      t = 1.2;
      draw(0);
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [nodes, hotRatio]);

  return <canvas ref={canvasRef} aria-hidden className={`block h-full w-full ${className}`} />;
}
