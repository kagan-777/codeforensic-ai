"use client";

import { useMemo, useRef } from "react";
import { useCanvasScene, type SceneFactory } from "./three/useCanvasScene";
import { cubesScene, helixScene, lensScene, ringsScene, shieldScene, towersScene, vaultScene } from "./three/scenes";

/**
 * One component for every page's 3D visual. Pages pass a scene name plus the
 * real data it should show (e.g. the dashboard passes its HIGH/MEDIUM/LOW counts).
 */
export type SceneProps =
  | { scene: "shield" }
  | { scene: "helix" }
  | { scene: "vault" }
  | { scene: "towers"; data: { high: number; medium: number; low: number } }
  | { scene: "cubes"; data: { count: number } }
  | { scene: "rings"; data: { scans: number; risk: number } }
  | { scene: "lens"; data: { severity: "HIGH" | "MEDIUM" | "LOW" } };

function factoryFor(p: SceneProps): SceneFactory {
  switch (p.scene) {
    case "shield":
      return shieldScene;
    case "helix":
      return helixScene;
    case "vault":
      return vaultScene;
    case "towers":
      return towersScene(p.data);
    case "cubes":
      return cubesScene(p.data);
    case "rings":
      return ringsScene(p.data);
    case "lens":
      return lensScene(p.data);
  }
}

export default function Scene3D(props: SceneProps & { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(props);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const factory = useMemo(() => factoryFor(props), [key]);
  useCanvasScene(ref, factory, [factory]);
  return <canvas ref={ref} aria-hidden className={`block h-full w-full ${props.className ?? ""}`} />;
}
