import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { diffLines } from "../lib/utils/line-diff";
import { normalizeExplanation } from "../lib/utils/explanation";
import { checkFixedCode, cleanFixedCode, mergeIntoWindow, validateExplanation } from "../lib/ai/validate";
import type { FindingForAI } from "../lib/ai/prompt";

const sqlFinding: FindingForAI = {
  ruleId: "SQLI-001",
  title: "Potential SQL Injection Pattern",
  description: "d",
  filePath: "src/Database.java",
  lineNumber: 2,
  severity: "HIGH",
  confidence: "HIGH",
  evidence: "e",
  codeSnippet: ['Statement stmt = conn.createStatement();', 'String q = "SELECT * FROM users WHERE id=" + userId;', "return stmt.executeQuery(q);"].join("\n"),
  snippetStartLine: 1,
  recommendation: "r",
  language: "Java",
};

const goodFix = [
  'PreparedStatement stmt = conn.prepareStatement("SELECT * FROM users WHERE id = ?");',
  "stmt.setString(1, userId);",
  "return stmt.executeQuery();",
].join("\n");

describe("line diff", () => {
  test("marks removed, added and unchanged lines", () => {
    const d = diffLines("a\nb\nc", "a\nB\nc");
    assert.deepEqual(d.map((x) => x.type), ["same", "removed", "added", "same"]);
  });
  test("identical text is all 'same'", () => {
    assert.ok(diffLines("x\ny", "x\ny").every((l) => l.type === "same"));
  });
});

describe("suggested code checks", () => {
  test("cleans markdown fences and line-number gutters", () => {
    assert.equal(cleanFixedCode("```java\nint a = 1;\n```"), "int a = 1;");
    assert.equal(cleanFixedCode(">>   12 | int a = 1;\n     13 | int b = 2;"), "int a = 1;\nint b = 2;");
  });

  test("accepts a real fix and re-scans it with our analyzer (not flagged)", () => {
    const r = checkFixedCode(goodFix, sqlFinding);
    assert.equal(r.code, goodFix);
    assert.equal(r.stillFlagged, false);
  });

  test("flags a 'fix' that still has the same risky pattern", () => {
    const r = checkFixedCode('String q = "SELECT * FROM users WHERE name=" + userName;', sqlFinding);
    assert.equal(r.stillFlagged, true);
  });

  test("drops suggestions that contain a hard-coded secret, are unchanged, or are empty", () => {
    assert.equal(checkFixedCode('String password = "Sup3rSecret99";', { ...sqlFinding, ruleId: "SECRET-001" }).code, "");
    assert.equal(checkFixedCode(sqlFinding.codeSnippet, sqlFinding).code, "");
    assert.equal(checkFixedCode("", sqlFinding).code, "");
    assert.equal(checkFixedCode(42, sqlFinding).code, "");
  });

  test("validateExplanation includes the fix, and forces manual review when still flagged", () => {
    const base = {
      summary: "s",
      why_risky: "w",
      evidence_explanation: "e",
      recommendation: "r",
      manual_review: false,
    };
    const ok = validateExplanation(JSON.stringify({ ...base, fixed_code: goodFix }), sqlFinding);
    assert.ok(ok.ok && ok.value.fixedCode === goodFix && !ok.value.manualReview);
    const bad = validateExplanation(
      JSON.stringify({ ...base, fixed_code: 'String q = "SELECT * FROM t WHERE id=" + userId;' }),
      sqlFinding,
    );
    assert.ok(bad.ok && bad.value.fixStillFlagged && bad.value.manualReview);
  });
});

describe("normalizeExplanation", () => {
  test("reads camelCase, snake_case and JSON strings; rejects empty", () => {
    assert.equal(normalizeExplanation({ summary: "a", whyRisky: "b" })?.whyRisky, "b");
    assert.equal(normalizeExplanation({ summary: "a", why_risky: "b", fixed_code: "x" })?.fixedCode, "x");
    assert.equal(normalizeExplanation('{"summary":"a"}')?.summary, "a");
    assert.equal(normalizeExplanation({}), null);
    assert.equal(normalizeExplanation(null), null);
    assert.equal(normalizeExplanation({ summary: "a" })?.fixedCode, undefined);
  });
});

describe("partial AI fixes (real case from the demo)", () => {
  const snippet = [
    "    console.log('==================================================');",
    "    console.log('MOCK EMAIL SERVICE: Verification Link');",
    "    console.log(`To: ${email}`);",
    "    console.log(`Link: http://localhost:5173/verify-email?token=${verificationToken}&email=${email}`);",
    "    console.log('==================================================');",
    "",
    "    res.status(201).json({",
  ].join("\n");
  const finding: FindingForAI = {
    ruleId: "EXPOSE-001",
    title: "Potential Sensitive Information Exposure",
    description: "d",
    filePath: "server/routes/auth.js",
    lineNumber: 41,
    severity: "MEDIUM",
    confidence: "MEDIUM",
    evidence: "e",
    codeSnippet: snippet,
    snippetStartLine: 38,
    recommendation: "r",
    language: "JavaScript",
  };

  test("a one-line answer is put back in place of the reported line only", () => {
    const merged = mergeIntoWindow(snippet, "console.log(`Link: http://localhost:5173/verify-email?email=${email}`);", 3);
    const lines = merged.split("\n");
    assert.equal(lines.length, 7);
    assert.equal(lines[2], "    console.log(`To: ${email}`);"); // untouched
    assert.equal(lines[3], "    console.log(`Link: http://localhost:5173/verify-email?email=${email}`);"); // indent kept
    assert.equal(lines[6], "    res.status(201).json({");
  });

  test("warns when the suggestion deletes a token the program may still need", () => {
    const r = checkFixedCode("console.log(`Link: http://localhost:5173/verify-email?email=${email}`);", finding);
    assert.deepEqual(r.removedNames, ["verificationToken"]);
    assert.equal(r.code.split("\n").length, 7);
  });

  test("a dev-only guard keeps the token and gives no warning", () => {
    const fix = snippet.replace(
      "    console.log(`Link:",
      '    if (process.env.NODE_ENV !== "production") console.log(`Link:',
    );
    const r = checkFixedCode(fix, finding);
    assert.deepEqual(r.removedNames, []);
  });
});
