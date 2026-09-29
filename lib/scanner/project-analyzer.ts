// Works out basic facts about the uploaded project: its name, the root folder
// to strip from paths, languages, and source vs. configuration file counts.

import type { Language } from "../../types/scanner";
import { CONFIG_LANGUAGES, SOURCE_LANGUAGES } from "./file-detector";

/**
 * If every path starts with the same top-level folder (e.g. "CollegeManagement/"),
 * return that folder name. ZIPs made by "right-click → compress" usually look like this.
 */
export function commonRootFolder(paths: string[]): string | null {
  const files = paths.filter((p) => !p.endsWith("/") && !p.startsWith("__MACOSX/"));
  if (files.length === 0) return null;
  const first = files[0].split("/")[0];
  if (!files.every((p) => p.includes("/") && p.split("/")[0] === first)) return null;
  return first;
}

export function stripRoot(path: string, root: string | null): string {
  return root && path.startsWith(root + "/") ? path.slice(root.length + 1) : path;
}

export function projectNameFrom(zipFilename: string, root: string | null): string {
  const fromZip = zipFilename.replace(/\.zip$/i, "").trim();
  const name = (root ?? fromZip) || "Untitled project";
  // Keep names printable and reasonably short.
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f<>]/g, "").slice(0, 100) || "Untitled project";
}

export interface ProjectSummary {
  languages: Language[];
  sourceFileCount: number;
  configFileCount: number;
}

export function summarizeLanguages(languages: Language[]): ProjectSummary {
  const unique = Array.from(new Set(languages)).sort() as Language[];
  return {
    languages: unique,
    sourceFileCount: languages.filter((l) => SOURCE_LANGUAGES.includes(l)).length,
    configFileCount: languages.filter((l) => CONFIG_LANGUAGES.includes(l)).length,
  };
}
