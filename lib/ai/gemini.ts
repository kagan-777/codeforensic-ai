// Server-side Gemini service. The API key is read from process.env on the
// server only — it is never sent to the browser.
//
// Reliability: if a model is busy (503), rate-limited (429) or not available
// to this account (404), we wait briefly and try the next model in the list:
//   GEMINI_MODEL, then GEMINI_FALLBACK_MODELS (comma-separated, optional).
import "server-only";

import { buildFindingPrompt, SYSTEM_INSTRUCTION, type FindingForAI } from "./prompt";
import { validateExplanation, type AiExplanation } from "./validate";

export type AiErrorCode = "NOT_CONFIGURED" | "RATE_LIMITED" | "BUSY" | "API_ERROR" | "TIMEOUT" | "INVALID_RESPONSE";

const USER_MESSAGES: Record<AiErrorCode, string> = {
  NOT_CONFIGURED: "AI explanations are not configured on this server (missing GEMINI_API_KEY).",
  RATE_LIMITED: "The AI service is receiving too many requests right now. Please wait a minute and try again.",
  BUSY: "The AI service is very busy right now. Please wait a moment and click Try again.",
  API_ERROR: "The AI service could not generate an explanation right now. Please try again later.",
  TIMEOUT: "The AI service took too long to respond. Please try again.",
  INVALID_RESPONSE:
    "The AI response did not pass our safety checks, so it was not shown. Please try again. The static-analysis evidence above is unaffected.",
};

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly userMessage: string;
  constructor(code: AiErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.userMessage = USER_MESSAGES[code];
  }
}

const TIMEOUT_MS = 25_000;

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

/** Models to try, in order, without duplicates. */
export function modelsToTry(): string[] {
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-flash-latest,gemini-3.5-flash")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return Array.from(new Set([GEMINI_MODEL, ...fallbacks]));
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGemini(model: string, prompt: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          // Newer models may "think" first; leave enough room for the JSON answer.
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              summary: { type: "STRING" },
              why_risky: { type: "STRING" },
              evidence_explanation: { type: "STRING" },
              recommendation: { type: "STRING" },
              fixed_code: { type: "STRING" },
              manual_review: { type: "BOOLEAN" },
            },
            required: ["summary", "why_risky", "evidence_explanation", "recommendation", "fixed_code", "manual_review"],
          },
        },
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new AiError("TIMEOUT", model);
    throw new AiError("API_ERROR", err instanceof Error ? err.message : "network error");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // Log status and Google's message only — never the key.
    const body = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 429) throw new AiError("RATE_LIMITED", `${model}: ${body}`);
    if (res.status === 503 || res.status === 500) throw new AiError("BUSY", `${model} HTTP ${res.status}: ${body}`);
    throw new AiError("API_ERROR", `${model} HTTP ${res.status}: ${body}`);
  }
  const data = (await res.json()) as GeminiResponse;
  const text =
    data.candidates?.[0]?.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("") ?? "";
  if (!text) {
    throw new AiError(
      "INVALID_RESPONSE",
      `${model}: empty response (${data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? "unknown"})`,
    );
  }
  return text;
}

/** Errors worth trying another model (or the same one again) for. */
function isTemporary(err: unknown): boolean {
  return err instanceof AiError && (err.code === "BUSY" || err.code === "RATE_LIMITED" || err.code === "TIMEOUT");
}
function isModelUnavailable(err: unknown): boolean {
  return err instanceof AiError && err.code === "API_ERROR" && / HTTP 404:/.test(err.message);
}

/**
 * Asks Gemini to explain ONE finding.
 * Tries each model in modelsToTry(); retries a busy model once; re-asks once if
 * the answer fails validation. Returns the validated explanation and the model used.
 */
export async function explainFinding(finding: FindingForAI): Promise<{ explanation: AiExplanation; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiError("NOT_CONFIGURED");

  const prompt = buildFindingPrompt(finding);
  let lastError: AiError = new AiError("API_ERROR", "no models tried");

  for (const model of modelsToTry()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await callGemini(model, prompt, apiKey);
        const result = validateExplanation(text, finding);
        if (result.ok) return { explanation: result.value, model };
        console.warn(`[gemini] ${model} response rejected (attempt ${attempt + 1}): ${result.reason}`);
        lastError = new AiError("INVALID_RESPONSE", `${model}: ${result.reason}`);
      } catch (err) {
        if (!(err instanceof AiError)) throw err;
        console.warn(`[gemini] ${err.message}`);
        lastError = err;
        if (isModelUnavailable(err)) break; // try the next model
        if (isTemporary(err)) {
          if (attempt === 0) {
            await sleep(1500); // short pause, then retry this model once
            continue;
          }
          break; // still busy: next model
        }
        throw err; // e.g. 403 permission denied: another model won't help
      }
    }
  }
  throw lastError;
}
