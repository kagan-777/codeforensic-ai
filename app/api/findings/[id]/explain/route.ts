// POST /api/findings/[id]/explain — ask Gemini to explain ONE finding.
// Only the finding's evidence and a small redacted code window are sent.
// The validated explanation is saved so it is not regenerated every visit.
import { isUuid, jsonError, requireApiUser } from "@/lib/auth";
import { getFinding } from "@/lib/scan/queries";
import { AiError, explainFinding } from "@/lib/ai/gemini";
import { rateLimit } from "@/lib/utils/rate-limit";
import { normalizeExplanation } from "@/lib/utils/explanation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return jsonError(400, "Invalid finding id.");
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  let regenerate = false;
  try {
    const body = (await request.json()) as { regenerate?: unknown };
    regenerate = body.regenerate === true;
  } catch {
    // empty body is fine
  }

  const finding = await getFinding(supabase, id).catch((err) => {
    console.error("[explain] finding lookup failed:", err);
    return null;
  });
  if (!finding) return jsonError(404, "Finding not found.");

  // Reuse a saved explanation, unless it is unreadable or was made before code suggestions existed.
  const saved = normalizeExplanation(finding.ai_explanation);
  if (saved && saved.fixedCode !== undefined && !regenerate) {
    return Response.json({ explanation: saved, model: finding.ai_model, cached: true });
  }

  if (!rateLimit(`explain:${user.id}`, 20, 60 * 1000)) {
    return jsonError(429, "Too many explanation requests. Please wait a minute and try again.");
  }

  try {
    const { explanation, model } = await explainFinding({
      ruleId: finding.rule_id,
      title: finding.title,
      description: finding.description,
      filePath: finding.file_path,
      lineNumber: finding.line_number,
      severity: finding.severity,
      confidence: finding.confidence,
      evidence: finding.evidence,
      codeSnippet: finding.code_snippet,
      snippetStartLine: finding.snippet_start_line,
      recommendation: finding.recommendation,
      language: finding.language ?? "unknown",
    });

    const { error } = await supabase
      .from("findings")
      .update({ ai_explanation: explanation, ai_model: model, ai_generated_at: new Date().toISOString() })
      .eq("id", finding.id);
    if (error) console.error("[explain] could not save explanation:", error.message); // still return it

    return Response.json({ explanation, model, cached: false });
  } catch (err) {
    if (err instanceof AiError) {
      console.error(`[explain] ${err.message}`);
      const status =
        err.code === "RATE_LIMITED" ? 429 : err.code === "NOT_CONFIGURED" || err.code === "BUSY" ? 503 : 502;
      return jsonError(status, err.userMessage);
    }
    console.error("[explain] unexpected error:", err);
    return jsonError(500, "Could not generate an explanation. Please try again.");
  }
}
