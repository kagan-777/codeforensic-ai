"use client";

import { useEffect, type RefObject } from "react";
import { readPalette, type Palette } from "@/lib/three/engine";

export interface Frame {
  ctx: CanvasRenderingContext2D;
  w: number; // CSS pixels
  h: number;
  t: number; // seconds since start
  dt: number; // seconds since last frame
}

/** Draws one frame. May have a dispose() to remove listeners when the scene unmounts. */
export type Renderer = ((frame: Frame) => void) & { dispose?: () => void };

/** A scene factory builds its state once, then returns a function that draws one frame. */
export type SceneFactory = (palette: Palette) => Renderer;

/**
 * Runs a canvas animation safely:
 *  - sharp on high-DPI screens, follows the element's size
 *  - pauses when the tab is hidden or the canvas is off-screen
 *  - "reduce motion" users get one still frame
 *  - cleans up on unmount
 */
export function useCanvasScene(ref: RefObject<HTMLCanvasElement | null>, factory: SceneFactory, deps: readonly unknown[]) {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = factory(readPalette());
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;
    let raf = 0;
    let t = 0;
    let last = performance.now();

    const drawOnce = (dt: number) => {
      ctx.clearRect(0, 0, w, h);
      render({ ctx, w, h, t, dt });
    };

    const ro = new ResizeObserver(() => {
      resize();
      if (reduceMotion) drawOnce(0);
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(canvas);

    if (reduceMotion) {
      t = 2;
      drawOnce(0);
    } else {
      const loop = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (visible && !document.hidden) {
          t += dt;
          drawOnce(dt);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      render.dispose?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
