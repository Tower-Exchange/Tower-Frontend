import { NextRequest, NextResponse } from "next/server";
import { requireWalletSession } from "@/lib/server/walletSession";
import {
  aiBackendUnconfiguredResponse,
  classifyTowerAiFetchError,
  getTowerAiBaseUrl,
  getTowerAiClientIp,
  logTowerAiProxyError,
  rejectNonFrontendAiRequest,
} from "@/lib/server/towerAiBackend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Atlas rejects anything over 8MB (STT_MAX_UPLOAD_BYTES); a 60s voice note
// recorded by the chat is a few hundred KB, so this only stops abuse early.
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const STT_FETCH_TIMEOUT_MS = 55_000;

/**
 * Voice note -> text. The browser posts the recording here, we forward it to
 * Atlas's /api/v1/stt with the secret key, and return { transcript }. The
 * client then sends the transcript through /api/ai/chat like a typed message,
 * so it gets every guard the chat route already applies.
 */
export async function POST(request: NextRequest) {
  let sttUrl: string | null = null;

  try {
    const frontendGate = rejectNonFrontendAiRequest(request);
    if (frontendGate) {
      return frontendGate;
    }

    const { wallet, response: sessionError } = requireWalletSession(request);
    if (sessionError || !wallet) {
      return (
        sessionError ??
        NextResponse.json(
          { error: "Wallet session required. Please sign in." },
          { status: 401 },
        )
      );
    }

    const backendUrl = getTowerAiBaseUrl();
    if (!backendUrl) {
      return aiBackendUnconfiguredResponse();
    }
    sttUrl = `${backendUrl}/api/v1/stt`;

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Empty audio upload" }, { status: 400 });
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Voice note too large, keep it under 8MB" },
        { status: 413 },
      );
    }

    // Identity comes from the signed session, never from the browser.
    const upstreamForm = new FormData();
    upstreamForm.append("file", file, file.name || "voice-note.webm");
    upstreamForm.append("wallet_address", wallet);
    upstreamForm.append("userid", wallet);

    // No Content-Type here: fetch sets the multipart boundary itself.
    const headers: Record<string, string> = { Connection: "close" };
    const apiKey = (process.env.TOWER_AI_API_KEY || "").trim();
    if (apiKey) {
      headers.endpoint_auth = apiKey;
    }
    const clientIp = getTowerAiClientIp(request);
    if (clientIp) {
      headers["X-Tower-Client-IP"] = clientIp;
    }

    const response = await fetch(sttUrl, {
      method: "POST",
      headers,
      body: upstreamForm,
      cache: "no-store",
      signal: AbortSignal.timeout(STT_FETCH_TIMEOUT_MS),
    });

    const data = (await response.json().catch(() => null)) as
      | { transcript?: unknown; detail?: unknown }
      | null;

    if (!response.ok) {
      const detail =
        typeof data?.detail === "string" && data.detail.trim()
          ? data.detail.trim()
          : "Could not transcribe audio";
      return NextResponse.json({ error: detail }, { status: response.status });
    }

    const transcript =
      typeof data?.transcript === "string" ? data.transcript.trim() : "";
    return NextResponse.json({ transcript });
  } catch (error) {
    logTowerAiProxyError("[api/ai/stt] proxy error", error, sttUrl);
    const failure = classifyTowerAiFetchError(error);
    return NextResponse.json(
      { error: failure.error, message: failure.message },
      { status: failure.status },
    );
  }
}
