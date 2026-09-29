import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { redactSecrets } from "../lib/utils/redact";
import { compareScans } from "../lib/scanner/compare";
import { findInventedFile, findInventedLine, findOverclaim, validateExplanation } from "../lib/ai/validate";
import { buildFindingPrompt, type FindingForAI } from "../lib/ai/prompt";

describe("redaction", () => {
  test("masks quoted secret assignments", () => {
    assert.equal(redactSecrets('API_KEY="real-secret"'), 'API_KEY="[REDACTED]"');
    assert.equal(redactSecrets("const password = 'hunter2';"), "const password = '[REDACTED]';");
    assert.equal(redactSecrets('{"clientSecret": "abc123xyz"}'), '{"clientSecret": "[REDACTED]"}');
  });
  test("masks unquoted config values only in config mode", () => {
    assert.equal(redactSecrets("DB_PASSWORD=hunter2", { config: true }), "DB_PASSWORD=[REDACTED]");
    assert.equal(redactSecrets("password = request.form['pw']"), "password = request.form['pw']");
    assert.equal(redactSecrets("spring.datasource.password=${DB_PASSWORD}", { config: true }), "spring.datasource.password=${DB_PASSWORD}");
  });
  test("masks known key formats anywhere", () => {
    assert.equal(redactSecrets("x = AKIAABCDEFGHIJKLMNOP"), "x = [REDACTED]");
  });
  test("leaves normal code alone", () => {
    const code = 'const name = "Alice";\nconsole.log(name);';
    assert.equal(redactSecrets(code), code);
  });
});

describe("scan comparison", () => {
  test("splits findings into new / no-longer-detected / still-detected", () => {
    const prev = [{ fingerprint: "a" }, { fingerprint: "b" }];
    const curr = [{ fingerprint: "b" }, { fingerprint: "c" }];
    const r = compareScans(prev, curr);
    assert.deepEqual(r.newFindings, [{ fingerprint: "c" }]);
    assert.deepEqual(r.noLongerDetected, [{ fingerprint: "a" }]);
    assert.deepEqual(r.stillDetected, [{ fingerprint: "b" }]);
  });
});

const finding: FindingForAI = {
  title: "Potential SQL Injection Pattern",
  description: "desc",
  filePath: "src/Database.java",
  lineNumber: 22,
  severity: "HIGH",
  confidence: "HIGH",
  evidence: 'The SQL query is built using string concatenation (+) with "userId".',
  codeSnippet: ["a", "b", "c", 'String q = "SELECT * FROM t WHERE id=" + userId;', "d", "e", "f"].join("\n"),
  snippetStartLine: 19,
  recommendation: "Use prepared statements.",
  language: "Java",
};

const good = {
  summary: "The analyzer detected a potential SQL injection pattern on line 22.",
  why_risky: "If userId comes from a user, it might change the query.",
  evidence_explanation: "In Database.java the value userId is added to the query text with +.",
  recommendation: "Consider a PreparedStatement with a ? placeholder.",
  manual_review: false,
};

describe("Gemini response validation", () => {
  test("accepts a well-formed, grounded response (also inside a ```json fence)", () => {
    const r = validateExplanation(JSON.stringify(good), finding);
    assert.equal(r.ok, true);
    const fenced = validateExplanation("```json\n" + JSON.stringify(good) + "\n```", finding);
    assert.equal(fenced.ok, true);
  });

  test("rejects invalid JSON, missing fields, wrong types", () => {
    assert.equal(validateExplanation("not json", finding).ok, false);
    assert.equal(validateExplanation(JSON.stringify({ ...good, summary: "" }), finding).ok, false);
    assert.equal(validateExplanation(JSON.stringify({ ...good, manual_review: "yes" }), finding).ok, false);
    assert.equal(validateExplanation("[1,2]", finding).ok, false);
  });

  test("rejects over-claiming, but allows negated statements", () => {
    assert.ok(findOverclaim("This is a confirmed vulnerability."));
    assert.ok(findOverclaim("After this change the project is 100% secure."));
    assert.equal(findOverclaim("This is not a confirmed vulnerability; review it."), null);
    assert.equal(validateExplanation(JSON.stringify({ ...good, summary: "Confirmed SQL injection here." }), finding).ok, false);
  });

  test("rejects invented line numbers and file names", () => {
    assert.equal(findInventedLine("see line 22 and lines 19-25", 19, 25), null);
    assert.equal(findInventedLine("see line 140", 19, 25), 140);
    assert.equal(findInventedFile("In UserController.java the value…", "src/Database.java", "code"), "UserController.java");
    assert.equal(findInventedFile("In Database.java…", "src/Database.java", "code"), null);
    assert.equal(validateExplanation(JSON.stringify({ ...good, why_risky: "Also on line 300 there is more." }), finding).ok, false);
  });

  test("LOW confidence forces manual review", () => {
    const r = validateExplanation(JSON.stringify(good), { ...finding, confidence: "LOW" });
    assert.ok(r.ok && r.value.manualReview);
  });

  test("prompt contains only the finding context and redacts secrets", () => {
    const p = buildFindingPrompt({ ...finding, codeSnippet: 'String password = "admin123";', snippetStartLine: 22 });
    assert.ok(p.includes("src/Database.java"));
    assert.ok(p.includes(">>   22 |"));
    assert.ok(!p.includes("admin123"));
  });
});
