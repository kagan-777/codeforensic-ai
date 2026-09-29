// Runs the static analyzer on a ZIP file from the command line.
// Useful to test the scanner WITHOUT Supabase or Gemini:
//   npm run scan -- demo-project/CollegeManagement.zip

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { scanZip } from "../lib/scanner/scanner";
import { ZipError } from "../lib/zip/safe-zip";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run scan -- path/to/project.zip");
  process.exit(1);
}

try {
  const out = scanZip(readFileSync(file), basename(file), (s) => console.log(`… ${s}`));
  console.log(`\nProject:       ${out.projectName}`);
  console.log(`Files scanned: ${out.filesScanned}`);
  console.log(`Languages:     ${out.languages.join(", ") || "none"}`);
  console.log(`Findings:      ${out.findings.length}  (HIGH ${out.counts.high} · MEDIUM ${out.counts.medium} · LOW ${out.counts.low})\n`);
  for (const f of out.findings) {
    console.log(`[${f.severity}] ${f.title}`);
    console.log(`   ${f.filePath}:${f.lineNumber}   confidence ${f.confidence}   (${f.ruleId})`);
    console.log(`   ${f.evidence}\n`);
  }
  if (out.skipped.length) console.log(`Skipped ${out.skipped.length} file(s), e.g. ${out.skipped[0].path} — ${out.skipped[0].reason}`);
} catch (err) {
  if (err instanceof ZipError) {
    console.error(`Rejected: ${err.userMessage}`);
    process.exit(2);
  }
  throw err;
}
