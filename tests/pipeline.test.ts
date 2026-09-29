import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runScan, NotFoundError, type ScanEvent, type ScanPatch, type ScanStore } from "../lib/scan/pipeline";
import { compareScans } from "../lib/scanner/compare";
import type { Finding } from "../types/scanner";
import { makeZip } from "./helpers/make-zip";

/**
 * In-memory stand-in for the Supabase tables. Like Row Level Security,
 * each store instance only "sees" rows belonging to its own user.
 */
class MemoryDb {
  projects: { id: string; userId: string; name: string; fileCount: number; languages: string[] }[] = [];
  scans: ({ id: string; userId: string; projectId: string; previousScanId: string | null; createdAt: number } & ScanPatch)[] = [];
  findings: (Finding & { scanId: string; projectId: string; userId: string })[] = [];
  private n = 0;
  id() {
    return `id-${++this.n}`;
  }
  storeFor(userId: string): ScanStore {
    return {
      createProject: async ({ name }) => {
        const id = this.id();
        this.projects.push({ id, userId, name, fileCount: 0, languages: [] });
        return id;
      },
      projectExists: async (projectId) => this.projects.some((p) => p.id === projectId && p.userId === userId),
      latestCompletedScanId: async (projectId) =>
        this.scans
          .filter((s) => s.projectId === projectId && s.userId === userId && s.status === "COMPLETED")
          .sort((a, b) => b.createdAt - a.createdAt)[0]?.id ?? null,
      createScan: async ({ projectId, previousScanId }) => {
        const id = this.id();
        this.scans.push({ id, userId, projectId, previousScanId, status: "QUEUED", createdAt: this.n });
        return id;
      },
      updateScan: async (scanId, patch) => {
        const s = this.scans.find((x) => x.id === scanId && x.userId === userId);
        if (!s) throw new Error("not found");
        Object.assign(s, patch);
      },
      insertFindings: async (scanId, projectId, fs) => {
        this.findings.push(...fs.map((f) => ({ ...f, scanId, projectId, userId })));
      },
      updateProject: async (projectId, patch) => {
        const p = this.projects.find((x) => x.id === projectId && x.userId === userId);
        if (p) Object.assign(p, { fileCount: patch.fileCount, languages: patch.languages });
      },
    };
  }
}

const v1 = makeZip([
  { name: "App/Login.java", content: 'class L {\n  String password = "admin123";\n  void f(String id) { q("SELECT * FROM u WHERE id=" + id); }\n}' },
  { name: "App/app.py", content: "print(password)" },
]);
const v2 = makeZip([
  { name: "App/Login.java", content: 'class L {\n  String password = System.getenv("PW");\n  void f(String id) { q("SELECT * FROM u WHERE id=" + id); }\n}' },
  { name: "App/app.py", content: "print(password)\neval(user_input)" },
]);

describe("scan pipeline", () => {
  test("creates project + scan, stores findings with counts, emits stages in order", async () => {
    const db = new MemoryDb();
    const events: ScanEvent[] = [];
    const result = await runScan({ store: db.storeFor("alice"), zip: v1, zipFilename: "app.zip", emit: (e) => events.push(e) });

    assert.equal(result.type, "complete");
    assert.equal(db.projects.length, 1);
    assert.equal(db.projects[0].name, "App");
    assert.deepEqual(db.projects[0].languages, ["Java", "Python"]);
    const scan = db.scans[0];
    assert.equal(scan.status, "COMPLETED");
    assert.equal(scan.files_scanned, 2);
    assert.equal(scan.findings_count, 3);
    assert.equal(scan.high_count, 2);
    assert.equal(scan.medium_count, 1);
    assert.equal(db.findings.length, 3);
    assert.ok(db.findings.every((f) => f.userId === "alice" && f.scanId === scan.id));
    const stages = events.filter((e) => e.type === "stage").map((e) => (e as { stage: string }).stage);
    assert.deepEqual(stages, ["validating", "extracting", "detecting", "analyzing", "saving", "completed"]);
  });

  test("invalid ZIP: friendly error and NO database records", async () => {
    const db = new MemoryDb();
    const result = await runScan({ store: db.storeFor("alice"), zip: Buffer.from("definitely not a zip file........."), zipFilename: "x.zip", emit: () => {} });
    assert.equal(result.type, "error");
    assert.match((result as { message: string }).message, /not a valid ZIP/);
    assert.equal(db.projects.length, 0);
    assert.equal(db.scans.length, 0);
  });

  test("rescan creates a NEW scan (old one kept), links previous, and comparison works", async () => {
    const db = new MemoryDb();
    const store = db.storeFor("alice");
    const first = await runScan({ store, zip: v1, zipFilename: "app.zip", emit: () => {} });
    assert.equal(first.type, "complete");
    const projectId = (first as { projectId: string }).projectId;
    const firstScanId = (first as { scanId: string }).scanId;

    const second = await runScan({ store, zip: v2, zipFilename: "app-v2.zip", projectId, emit: () => {} });
    assert.equal(second.type, "complete");
    const secondScanId = (second as { scanId: string }).scanId;

    assert.equal(db.projects.length, 1);
    assert.equal(db.scans.length, 2);
    assert.equal(db.scans.find((s) => s.id === secondScanId)!.previousScanId, firstScanId);
    assert.equal(db.scans.find((s) => s.id === firstScanId)!.findings_count, 3); // untouched

    const cmp = compareScans(
      db.findings.filter((f) => f.scanId === firstScanId),
      db.findings.filter((f) => f.scanId === secondScanId),
    );
    assert.deepEqual(cmp.noLongerDetected.map((f) => f.ruleId), ["SECRET-001"]);
    assert.deepEqual(cmp.newFindings.map((f) => f.ruleId), ["DANGER-001"]);
    assert.equal(cmp.stillDetected.length, 2);
  });

  test("a user cannot rescan another user's project", async () => {
    const db = new MemoryDb();
    const first = await runScan({ store: db.storeFor("alice"), zip: v1, zipFilename: "app.zip", emit: () => {} });
    const projectId = (first as { projectId: string }).projectId;
    await assert.rejects(
      runScan({ store: db.storeFor("mallory"), zip: v2, zipFilename: "x.zip", projectId, emit: () => {} }),
      NotFoundError,
    );
    assert.equal(db.scans.length, 1);
  });

  test("a scan that fails mid-way is marked FAILED with a friendly message", async () => {
    const db = new MemoryDb();
    const store = db.storeFor("alice");
    store.insertFindings = async () => {
      throw new Error("database down");
    };
    const result = await runScan({ store, zip: v1, zipFilename: "app.zip", emit: () => {} });
    assert.equal(result.type, "error");
    assert.equal(db.scans[0].status, "FAILED");
    assert.ok(!db.scans[0].error_message!.includes("database down")); // no internals leaked
  });
});
