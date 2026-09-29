import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { extractSelected, readZipDirectory, validateEntryPath, ZipError, ZIP_LIMITS } from "../lib/zip/safe-zip";
import { scanZip } from "../lib/scanner/scanner";
import { looksBinary, skipReason } from "../lib/scanner/file-detector";
import { makeZip } from "./helpers/make-zip";

function expectZipError(fn: () => unknown, code: string) {
  assert.throws(fn, (err: unknown) => err instanceof ZipError && err.code === code);
}

describe("path validation", () => {
  test("accepts normal paths and normalizes them", () => {
    assert.equal(validateEntryPath("src/./Main.java"), "src/Main.java");
    assert.equal(validateEntryPath("src\\win\\File.java"), "src/win/File.java");
    assert.equal(validateEntryPath("folder/"), "folder/");
  });
  test("rejects traversal, absolute, drive letters and control characters", () => {
    for (const bad of ["../../etc/passwd", "a/../../b", "/etc/passwd", "C:\\Windows\\x", "..\\evil", "a\u0000b", "a\nb"]) {
      expectZipError(() => validateEntryPath(bad), "UNSAFE_PATH");
    }
  });
});

describe("ZIP reading", () => {
  test("extracts a normal ZIP (deflate and stored)", () => {
    const zip = makeZip([
      { name: "p/a.js", content: "console.log(1)" },
      { name: "p/b.py", content: "print(2)", method: 0 },
    ]);
    const dir = readZipDirectory(zip);
    const res = extractSelected(zip, dir, () => null);
    assert.deepEqual(res.files.map((f) => [f.path, f.data.toString()]), [
      ["p/a.js", "console.log(1)"],
      ["p/b.py", "print(2)"],
    ]);
  });

  test("rejects the whole ZIP if any entry has a traversal path", () => {
    const zip = makeZip([{ name: "ok.js", content: "x" }, { name: "../../evil.sh", content: "rm -rf /" }]);
    expectZipError(() => readZipDirectory(zip), "UNSAFE_PATH");
  });

  test("rejects non-ZIP, empty and corrupted files", () => {
    expectZipError(() => readZipDirectory(Buffer.from("this is not a zip at all, just text......")), "INVALID_ZIP");
    expectZipError(() => readZipDirectory(makeZip([])), "EMPTY_ZIP");
    const zip = makeZip([{ name: "a.js", content: "hello world ".repeat(50) }]);
    const broken = Buffer.from(zip);
    broken[40] ^= 0xff; // damage compressed data
    broken[41] ^= 0xff;
    expectZipError(() => extractSelected(broken, readZipDirectory(broken), () => null), "CORRUPTED");
    expectZipError(() => readZipDirectory(zip.subarray(0, zip.length - 30)), "CORRUPTED");
  });

  test("rejects ZIPs over the size limit", () => {
    const big = Buffer.alloc(ZIP_LIMITS.maxZipBytes + 1);
    big.writeUInt32LE(0x04034b50, 0);
    expectZipError(() => readZipDirectory(big), "TOO_LARGE");
  });

  test("detects ZIP bombs by compression ratio", () => {
    const bomb = makeZip([{ name: "bomb.txt", content: Buffer.alloc(20 * 1024 * 1024, 0) }]);
    expectZipError(() => readZipDirectory(bomb), "ZIP_BOMB");
  });

  test("an entry that lies about its size cannot expand past the declared size", () => {
    const liar = makeZip([{ name: "a.js", content: "a".repeat(5000), fakeUncompressedSize: 10 }]);
    expectZipError(() => extractSelected(liar, readZipDirectory(liar), () => null), "CORRUPTED");
  });

  test("skips symlinks instead of following them", () => {
    const zip = makeZip([{ name: "link.js", content: "/etc/passwd", symlink: true }, { name: "a.js", content: "x" }]);
    const res = extractSelected(zip, readZipDirectory(zip), () => null);
    assert.deepEqual(res.files.map((f) => f.path), ["a.js"]);
    assert.equal(res.skipped[0].reason, "Symbolic link ignored");
  });
});

describe("file filtering", () => {
  test("ignores dependency/build folders, unsupported types, lock files and big files", () => {
    assert.match(skipReason("node_modules/x/index.js", 10)!, /Dependency/);
    assert.match(skipReason("app/.git/config", 10)!, /Dependency/);
    assert.match(skipReason("py/__pycache__/a.py", 10)!, /Dependency/);
    assert.match(skipReason("img/logo.png", 10)!, /Unsupported/);
    assert.match(skipReason("inner.zip", 10)!, /Unsupported/);
    assert.match(skipReason("package-lock.json", 10)!, /Lock/);
    assert.match(skipReason("big.js", 600 * 1024)!, /too large/);
    assert.equal(skipReason("src/Main.java", 100), null);
    assert.equal(skipReason("config/.env", 100), null);
  });
  test("detects binary content", () => {
    assert.equal(looksBinary(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01])), true);
    assert.equal(looksBinary(Buffer.from("const x = 1;\n")), false);
  });
});

describe("scanZip end to end", () => {
  test("strips the common root folder, uses it as project name, and reports languages", () => {
    const zip = makeZip([
      { name: "MyApp/src/Main.java", content: 'String password = "admin123";' },
      { name: "MyApp/web/app.js", content: "eval(input);" },
      { name: "MyApp/node_modules/lib/index.js", content: "eval(x)" },
      { name: "MyApp/logo.png", content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]) },
    ]);
    const out = scanZip(zip, "upload.zip");
    assert.equal(out.projectName, "MyApp");
    assert.equal(out.filesScanned, 2);
    assert.deepEqual(out.languages, ["Java", "JavaScript"]);
    assert.deepEqual(out.findings.map((f) => f.filePath).sort(), ["src/Main.java", "web/app.js"]);
    assert.equal(out.counts.high, 1);
    assert.equal(out.counts.medium, 1);
  });

  test("ZIP with only folders is empty", () => {
    expectZipError(() => scanZip(makeZip([{ name: "a/", content: "" }]), "x.zip"), "EMPTY_ZIP");
  });
});
