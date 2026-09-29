// Decides which files in the ZIP are worth analyzing, and what language they are.

import type { Language } from "../../types/scanner";

export const MAX_SOURCE_FILE_BYTES = 512 * 1024; // 512 KB per file
export const MAX_FILES_TO_ANALYZE = 2000;

/** Folders that contain dependencies, build output or tooling — never analyzed. */
export const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "out",
  "target",
  "venv",
  ".venv",
  "env",
  "__pycache__",
  ".idea",
  ".vscode",
  "coverage",
  "vendor",
  "bower_components",
  ".gradle",
  "__MACOSX",
]);

const EXTENSION_MAP: Record<string, Language> = {
  java: "Java",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  ts: "TypeScript",
  tsx: "TypeScript",
  mts: "TypeScript",
  cts: "TypeScript",
  py: "Python",
  sql: "SQL",
  html: "HTML",
  htm: "HTML",
  json: "JSON",
  yml: "YAML",
  yaml: "YAML",
  properties: "Properties",
  env: "ENV",
  ini: "Config",
  cfg: "Config",
  conf: "Config",
  toml: "Config",
};

/** Files we know are huge/generated and not written by the developer. */
const IGNORED_FILENAMES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "composer.lock"]);

export const SOURCE_LANGUAGES: readonly Language[] = ["Java", "JavaScript", "TypeScript", "Python", "SQL", "HTML"];
export const CONFIG_LANGUAGES: readonly Language[] = ["JSON", "YAML", "Properties", "ENV", "Config"];

export function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
}

export function detectLanguage(path: string): Language | null {
  const name = basename(path).toLowerCase();
  if (name === ".env" || name.startsWith(".env.") || name.endsWith(".env")) return "ENV";
  if (name.endsWith(".min.js")) return null;
  const dot = name.lastIndexOf(".");
  if (dot <= 0 && !name.startsWith(".")) return null;
  const ext = name.slice(dot + 1);
  return EXTENSION_MAP[ext] ?? null;
}

export function isInIgnoredDirectory(path: string): boolean {
  const parts = path.split("/");
  parts.pop(); // file name
  return parts.some((p) => IGNORED_DIRECTORIES.has(p) || p === "pycache");
}

/**
 * Returns null if the file should be analyzed, otherwise a human-readable skip reason.
 * `size` is the uncompressed size from the ZIP directory.
 */
export function skipReason(path: string, size: number): string | null {
  if (isInIgnoredDirectory(path)) return "Dependency/build folder ignored";
  if (IGNORED_FILENAMES.has(basename(path).toLowerCase())) return "Lock file ignored";
  const lang = detectLanguage(path);
  if (!lang) return "Unsupported file type";
  if (size > MAX_SOURCE_FILE_BYTES) return "File too large (over 512 KB)";
  return null;
}

/** Heuristic: a NUL byte or lots of control characters in the first 8 KB means binary. */
export function looksBinary(data: Buffer): boolean {
  const sample = data.subarray(0, 8192);
  if (sample.length === 0) return false;
  let control = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 9 || (byte > 13 && byte < 32)) control++;
  }
  return control / sample.length > 0.1;
}
