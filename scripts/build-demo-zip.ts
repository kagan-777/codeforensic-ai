// Builds the demo ZIPs from the demo-project folders:
//   npm run demo:zip
// -> demo-project/CollegeManagement.zip        (insecure version)
// -> demo-project/CollegeManagement-fixed.zip  (improved version, for testing rescan)

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { makeZip, type ZipInput } from "../tests/helpers/make-zip";

function collect(root: string, base: string): ZipInput[] {
  const out: ZipInput[] = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory()) out.push(...collect(full, base));
    else out.push({ name: relative(base, full).split("\\").join("/"), content: readFileSync(full) });
  }
  return out;
}

const demos: [string, string][] = [
  ["demo-project/CollegeManagement", "demo-project/CollegeManagement.zip"],
  ["demo-project/fixed/CollegeManagement", "demo-project/CollegeManagement-fixed.zip"],
];

for (const [folder, zipPath] of demos) {
  if (!existsSync(folder)) continue;
  const parent = join(folder, "..");
  writeFileSync(zipPath, makeZip(collect(folder, parent)));
  console.log(`Created ${zipPath}`);
}
