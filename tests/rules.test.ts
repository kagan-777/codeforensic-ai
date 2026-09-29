import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { scanFiles } from "../lib/scanner/scanner";
import { detectLanguage } from "../lib/scanner/file-detector";
import type { Finding } from "../types/scanner";

/** Scans a single in-memory file and returns its findings. */
function scan(path: string, content: string): Finding[] {
  const language = detectLanguage(path);
  assert.ok(language, `no language for ${path}`);
  return scanFiles([{ path, language, content }]).findings;
}
const byRule = (fs: Finding[], prefix: string) => fs.filter((f) => f.ruleId.startsWith(prefix));

describe("RULE 1 — hardcoded secret", () => {
  test("flags password assigned a literal (HIGH severity, HIGH confidence, correct line)", () => {
    const f = byRule(scan("Login.java", 'class A {\n  String password = "admin123";\n}'), "SECRET");
    assert.equal(f.length, 1);
    assert.equal(f[0].lineNumber, 2);
    assert.equal(f[0].severity, "HIGH");
    assert.equal(f[0].confidence, "HIGH");
    assert.equal(f[0].title, "Potential Hardcoded Secret");
  });

  test("short/simple value gives MEDIUM confidence", () => {
    const f = byRule(scan("a.js", 'const apiKey = "ABC123";'), "SECRET");
    assert.equal(f.length, 1);
    assert.equal(f[0].confidence, "MEDIUM");
  });

  test("flags secret = \"my-secret\" in Python", () => {
    assert.equal(byRule(scan("s.py", 'secret = "my-secret"'), "SECRET").length, 1);
  });

  test("flags unquoted value in .properties and .env, including '#' inside the value", () => {
    assert.equal(byRule(scan("application.properties", "spring.datasource.password=Pa#ss2024"), "SECRET").length, 1);
    assert.equal(byRule(scan(".env", "DB_PASSWORD=s3cr3tValue"), "SECRET").length, 1);
  });

  test("flags a known key format regardless of variable name", () => {
    const f = byRule(scan("c.js", 'const x = "AKIAABCDEFGHIJKLMNOP";'), "SECRET");
    assert.equal(f.length, 1);
    assert.equal(f[0].confidence, "HIGH");
  });

  test("does NOT flag placeholders or obvious non-secrets", () => {
    const code = [
      'password = "password"',
      'api_key = "your-api-key"',
      'token = "example"',
      'secret = "test"',
      'password = "placeholder"',
      'passwordLabel = "Enter your password here"',
      'tokenUrl = "https://example.org/oauth/token"',
      'password = os.environ["DB_PASSWORD"]',
      'password = ""',
      "# password = \"commentedOut123\"",
    ].join("\n");
    assert.deepEqual(byRule(scan("x.py", code), "SECRET"), []);
  });

  test("does NOT flag env references in config", () => {
    assert.deepEqual(byRule(scan("application.properties", "spring.datasource.password=${DB_PASSWORD}"), "SECRET"), []);
  });

  test("does NOT flag comparisons or example files", () => {
    assert.deepEqual(byRule(scan("a.js", 'if (password === "hunter22") {}'), "SECRET"), []);
    assert.deepEqual(byRule(scan(".env.example", "DB_PASSWORD=realLooking123"), "SECRET"), []);
  });

  test("the secret value is never included in the evidence or snippet", () => {
    const f = byRule(scan("Login.java", 'String password = "admin123";'), "SECRET")[0];
    assert.ok(!f.evidence.includes("admin123"));
    assert.ok(!f.codeSnippet.includes("admin123"));
    assert.ok(f.codeSnippet.includes("[REDACTED]"));
  });
});

describe("RULE 2 — SQL injection pattern", () => {
  test("flags Java concatenation split over two lines (reports first line, HIGH/HIGH)", () => {
    const code = 'class D {\n  void f(String userId) {\n    String query =\n      "SELECT * FROM users WHERE id=" + userId;\n  }\n}';
    const f = byRule(scan("Database.java", code), "SQLI");
    assert.equal(f.length, 1);
    assert.equal(f[0].lineNumber, 4);
    assert.equal(f[0].severity, "HIGH");
    assert.equal(f[0].confidence, "HIGH");
    assert.match(f[0].evidence, /userId/);
    assert.match(f[0].evidence, /concatenation/);
  });

  test("flags JS template literal and Python f-string / % formatting", () => {
    assert.equal(byRule(scan("a.js", "db.query(`SELECT * FROM users WHERE name = '${name}'`);"), "SQLI").length, 1);
    assert.equal(byRule(scan("a.py", "cur.execute(f\"DELETE FROM users WHERE id = {user_id}\")"), "SQLI").length, 1);
    assert.equal(byRule(scan("b.py", 'cur.execute("SELECT * FROM t WHERE id = %s" % uid)'), "SQLI").length, 1);
  });

  test("MEDIUM confidence for a neutral variable name, LOW for constants", () => {
    assert.equal(byRule(scan("a.js", 'const q = "SELECT * FROM t WHERE x = " + thing;'), "SQLI")[0].confidence, "MEDIUM");
    assert.equal(byRule(scan("a.js", 'const q = "SELECT * FROM " + TABLE_NAME;'), "SQLI")[0].confidence, "LOW");
  });

  test("does NOT flag parameterized queries", () => {
    const code = [
      'PreparedStatement ps = conn.prepareStatement("SELECT * FROM users WHERE id = ?");',
      "ps.setString(1, userId);",
    ].join("\n");
    assert.deepEqual(byRule(scan("Safe.java", code), "SQLI"), []);
    assert.deepEqual(byRule(scan("safe.py", 'cur.execute("SELECT * FROM users WHERE id = %s", (uid,))'), "SQLI"), []);
    assert.deepEqual(byRule(scan("safe.js", 'db.query("SELECT * FROM users WHERE id = $1", [id]);'), "SQLI"), []);
  });

  test("does NOT flag non-SQL strings joined with variables", () => {
    assert.deepEqual(byRule(scan("a.js", 'const msg = "Please select a file from " + folder;'), "SQLI"), []);
  });
});

describe("RULE 3 — dangerous function usage", () => {
  test("flags eval with dynamic input (MEDIUM severity, HIGH confidence)", () => {
    const f = byRule(scan("a.js", "function c(x) {\n  return eval(x);\n}"), "DANGER");
    assert.equal(f.length, 1);
    assert.equal(f[0].lineNumber, 2);
    assert.equal(f[0].severity, "MEDIUM");
    assert.equal(f[0].confidence, "HIGH");
  });

  test("literal-only argument gives LOW confidence", () => {
    assert.equal(byRule(scan("a.py", 'eval("2 + 2")'), "DANGER")[0].confidence, "LOW");
  });

  test("flags os.system, Runtime.exec, new Function, subprocess shell=True", () => {
    assert.equal(byRule(scan("a.py", 'os.system("rm " + path)'), "DANGER").length, 1);
    assert.equal(byRule(scan("A.java", 'Runtime.getRuntime().exec("ping " + host);'), "DANGER").length, 1);
    assert.equal(byRule(scan("a.js", "const f = new Function(body);"), "DANGER").length, 1);
    assert.equal(byRule(scan("b.py", "subprocess.run(cmd, shell=True)"), "DANGER").length, 1);
  });

  test("does NOT flag look-alikes (model.eval(), regex.exec(), words inside strings)", () => {
    assert.deepEqual(byRule(scan("t.py", "model.eval()"), "DANGER"), []);
    assert.deepEqual(byRule(scan("r.js", "const m = /a/.exec(text);"), "DANGER"), []);
    assert.deepEqual(byRule(scan("s.js", 'console.log("never use eval(x) in production");'), "DANGER"), []);
    assert.deepEqual(byRule(scan("t.py", "subprocess.run(['ls', '-l'])"), "DANGER"), []);
  });

  test("child_process exec only flagged when child_process is imported", () => {
    assert.equal(byRule(scan("a.js", "const { exec } = require('child_process');\nexec(cmd);"), "DANGER").length, 1);
    assert.deepEqual(byRule(scan("b.js", "exec(cmd);"), "DANGER"), []);
  });
});

describe("RULE 4 — sensitive information exposure", () => {
  test("flags console.log / print / System.out.println of a password (MEDIUM severity)", () => {
    const js = byRule(scan("a.js", 'console.log("pw:", password);'), "EXPOSE");
    assert.equal(js.length, 1);
    assert.equal(js[0].severity, "MEDIUM");
    assert.equal(js[0].confidence, "HIGH");
    assert.equal(byRule(scan("a.py", "print(password)"), "EXPOSE").length, 1);
    assert.equal(byRule(scan("A.java", 'System.out.println("pw " + password);'), "EXPOSE").length, 1);
    assert.equal(byRule(scan("b.py", 'print(f"token is {token}")'), "EXPOSE").length, 1);
    assert.equal(byRule(scan("b.js", "console.log(`key ${user.apiKey}`);"), "EXPOSE").length, 1);
  });

  test("partial names get MEDIUM confidence", () => {
    assert.equal(byRule(scan("a.js", "console.log(userPassword);"), "EXPOSE")[0].confidence, "MEDIUM");
  });

  test("does NOT flag messages that only mention a password, or non-secret names", () => {
    assert.deepEqual(byRule(scan("a.js", 'console.log("Please enter your password");'), "EXPOSE"), []);
    assert.deepEqual(byRule(scan("a.js", "console.log(passwordLength, tokenCount);"), "EXPOSE"), []);
    assert.deepEqual(byRule(scan("a.py", "print(username)"), "EXPOSE"), []);
  });
});

describe("RULE 5 — insecure configuration", () => {
  test("debug=true in properties: LOW severity, HIGH confidence", () => {
    const f = byRule(scan("application.properties", "server.port=8080\ndebug=true"), "CONFIG");
    assert.equal(f.length, 1);
    assert.equal(f[0].lineNumber, 2);
    assert.equal(f[0].severity, "LOW");
    assert.equal(f[0].confidence, "HIGH");
  });

  test("Flask debug server and disabled TLS verification are MEDIUM", () => {
    assert.equal(byRule(scan("app.py", 'app.run(host="0.0.0.0", debug=True)'), "CONFIG")[0].severity, "MEDIUM");
    assert.equal(byRule(scan("c.py", "requests.get(url, verify=False)"), "CONFIG")[0].ruleId, "CONFIG-004");
    assert.equal(byRule(scan("c.js", "const agent = new https.Agent({ rejectUnauthorized: false });"), "CONFIG").length, 1);
  });

  test("YAML/JSON/env debug flags and CORS wildcard", () => {
    assert.equal(byRule(scan("config.yml", "app:\n  debug: true"), "CONFIG").length, 1);
    assert.equal(byRule(scan("settings.json", '{\n  "debug": true\n}'), "CONFIG").length, 1);
    assert.equal(byRule(scan(".env", "APP_DEBUG=1"), "CONFIG").length, 1);
    assert.equal(byRule(scan("s.js", "app.use(cors({ origin: '*' }));"), "CONFIG")[0].ruleId, "CONFIG-005");
  });

  test("does NOT flag disabled debug or log level names", () => {
    assert.deepEqual(byRule(scan("application.properties", "debug=false\nlogging.level.root=DEBUG"), "CONFIG"), []);
    assert.deepEqual(byRule(scan("app.py", "app.run(debug=False)"), "CONFIG"), []);
  });
});

describe("scanner", () => {
  test("every finding has file, line, snippet containing the line, and evidence", () => {
    const code = 'x = 1\npassword = "hunter2hunter2"\nprint(password)\n';
    for (const f of scanFiles([{ path: "a.py", language: "Python", content: code }]).findings) {
      assert.ok(f.filePath && f.lineNumber >= 1 && f.evidence.length > 10);
      const lines = f.codeSnippet.split("\n");
      assert.ok(f.lineNumber >= f.snippetStartLine && f.lineNumber < f.snippetStartLine + lines.length);
    }
  });

  test("findings are sorted HIGH → MEDIUM → LOW", () => {
    const code = 'debug=true\npassword=RealValue123';
    const sev = scanFiles([{ path: ".env", language: "ENV", content: code }]).findings.map((f) => f.severity);
    assert.deepEqual(sev, ["HIGH", "LOW"]);
  });

  test("fingerprints survive line shifts but differ for different code", () => {
    const a = scanFiles([{ path: "a.py", language: "Python", content: 'print(password)' }]).findings[0];
    const b = scanFiles([{ path: "a.py", language: "Python", content: '\n\n\nprint(password)' }]).findings[0];
    const c = scanFiles([{ path: "a.py", language: "Python", content: 'print(token)' }]).findings[0];
    assert.equal(a.fingerprint, b.fingerprint);
    assert.notEqual(a.fingerprint, c.fingerprint);
  });
});
