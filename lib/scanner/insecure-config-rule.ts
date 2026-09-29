// RULE 5 — Potential Insecure Configuration
// A small set of configuration patterns that are easy to explain and rarely
// intended in production. Each sub-check has its own id, severity and advice.

import type { Confidence, Language, RuleMatch, SecurityRule, Severity, SourceFile } from "../../types/scanner";
import { isCommentLine, shorten } from "./text-utils";

interface ConfigCheck {
  ruleId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  languages: readonly Language[];
  regex: RegExp;
  description: string;
  recommendation: string;
  evidence: string;
}

const CONFIG_FILES: readonly Language[] = ["Properties", "ENV", "YAML", "Config", "JSON"];

const CHECKS: ConfigCheck[] = [
  {
    ruleId: "CONFIG-001",
    title: "Potential Insecure Configuration: Debug Mode Enabled",
    severity: "LOW",
    confidence: "HIGH",
    languages: CONFIG_FILES,
    // debug=true, APP_DEBUG=1, "debug": true, logging.debug: yes …
    regex: /^\s*["']?(?:[\w.-]*[._-])?debug["']?\s*[:=]\s*["']?(?:true|1|yes|on)["']?\s*,?\s*$/i,
    description:
      "A configuration setting turns on debug mode. Debug mode can show detailed error messages, stack traces or internal data to anyone who can reach the application.",
    recommendation:
      "Make sure debug mode is disabled in production, for example by reading it from an environment variable that defaults to false.",
    evidence: "A configuration key named like 'debug' is set to an enabled value",
  },
  {
    ruleId: "CONFIG-002",
    title: "Potential Insecure Configuration: Flask Debug Server",
    severity: "MEDIUM",
    confidence: "HIGH",
    languages: ["Python"],
    regex: /\.run\s*\([^)]*\bdebug\s*=\s*True\b/,
    description:
      "The Flask application is started with debug=True. Flask's debug mode includes an interactive debugger that can allow code execution if it is reachable by others.",
    recommendation: "Do not use debug=True outside local development. Control it with an environment variable and use a production server (such as gunicorn) for deployment.",
    evidence: "app.run(...) is called with debug=True",
  },
  {
    ruleId: "CONFIG-003",
    title: "Potential Insecure Configuration: Debug Mode Enabled",
    severity: "MEDIUM",
    confidence: "MEDIUM",
    languages: ["Python"],
    regex: /^\s*DEBUG\s*=\s*True\b/,
    description:
      "DEBUG = True is set in Python settings (commonly Django). In debug mode, detailed error pages can reveal code, settings and data.",
    recommendation: "Set DEBUG = False in production, ideally reading the value from an environment variable.",
    evidence: "The setting DEBUG is assigned True",
  },
  {
    ruleId: "CONFIG-004",
    title: "Potential Insecure Configuration: TLS Certificate Verification Disabled",
    severity: "MEDIUM",
    confidence: "HIGH",
    languages: ["Python", "JavaScript", "TypeScript", "ENV", "JSON", "YAML", "Config"],
    regex: /(\bverify\s*=\s*False\b|\brejectUnauthorized["']?\s*:\s*false\b|NODE_TLS_REJECT_UNAUTHORIZED["']?\s*[:=]\s*["']?0)/,
    description:
      "HTTPS certificate verification appears to be turned off. Without verification, the application cannot be sure it is talking to the real server, which makes interception (man-in-the-middle) easier.",
    recommendation:
      "Keep certificate verification enabled. If you use a self-signed certificate in development, configure the trusted certificate instead of disabling verification.",
    evidence: "A setting that disables TLS/HTTPS certificate verification was found",
  },
  {
    ruleId: "CONFIG-005",
    title: "Potential Insecure Configuration: CORS Allows Any Origin",
    severity: "LOW",
    confidence: "MEDIUM",
    languages: ["JavaScript", "TypeScript", "Java", "Python", "Properties", "YAML", "ENV", "JSON", "Config"],
    regex:
      /(Access-Control-Allow-Origin["']?\s*[,:=]\s*["']\*["']|\borigin["']?\s*:\s*["']\*["']|allowed-?origins?["']?\s*[:=]\s*["']?\*["']?\s*$|allowedOrigins\s*\(\s*"\*"\s*\)|CORS_(?:ORIGIN_)?ALLOW_ALL(?:_ORIGINS)?\s*=\s*True)/i,
    description:
      "Cross-Origin Resource Sharing (CORS) appears to allow requests from any website ('*'). This may be fine for fully public data, but can be risky for APIs that return user-specific data.",
    recommendation: "Allow only the specific origins (websites) that need access to your API.",
    evidence: "A CORS setting allows any origin ('*')",
  },
  {
    ruleId: "CONFIG-006",
    title: "Potential Insecure Configuration: All Actuator Endpoints Exposed",
    severity: "MEDIUM",
    confidence: "HIGH",
    languages: ["Properties"],
    regex: /^\s*management\.endpoints\.web\.exposure\.include\s*[=:]\s*\*/,
    description:
      "All Spring Boot Actuator endpoints are exposed over the web. Some endpoints can reveal environment details, configuration or internal state.",
    recommendation: "Expose only the endpoints you need (for example 'health'), and protect the rest with authentication.",
    evidence: "management.endpoints.web.exposure.include is set to '*'",
  },
  {
    ruleId: "CONFIG-007",
    title: "Potential Insecure Configuration: Any Host Allowed",
    severity: "LOW",
    confidence: "MEDIUM",
    languages: ["Python"],
    regex: /^\s*ALLOWED_HOSTS\s*=\s*\[\s*["']\*["']\s*\]/,
    description: "ALLOWED_HOSTS accepts any host name ('*'). Django uses this setting to protect against HTTP Host header attacks.",
    recommendation: "List the real domain names your application is served from.",
    evidence: "ALLOWED_HOSTS is set to ['*']",
  },
];

export const insecureConfigRule: SecurityRule = {
  id: "CONFIG",
  title: "Potential Insecure Configuration",
  description: "A configuration setting that is commonly insecure outside of local development.",
  severity: "LOW",
  recommendation: "Review this setting before deploying.",
  languages: ["Python", "JavaScript", "TypeScript", "Java", "Properties", "ENV", "YAML", "Config", "JSON"],

  check(file: SourceFile, lines: string[]): RuleMatch[] {
    const matches: RuleMatch[] = [];
    lines.forEach((line, idx) => {
      if (isCommentLine(line, file.language)) return;
      for (const c of CHECKS) {
        if (!c.languages.includes(file.language)) continue;
        if (!c.regex.test(line)) continue;
        matches.push({
          lineNumber: idx + 1,
          ruleId: c.ruleId,
          title: c.title,
          severity: c.severity,
          confidence: c.confidence,
          description: c.description,
          recommendation: c.recommendation,
          evidence: `${c.evidence}: ${shorten(line, 100)}`,
        });
        return;
      }
    });
    return matches;
  },
};
