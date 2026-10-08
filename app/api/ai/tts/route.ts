import { NextRequest, NextResponse } from "next/server";
import { requireWalletSession } from "@/lib/server/walletSession";
import {
  aiBackendUnconfiguredResponse,
  classifyTowerAiFetchError,
  getTowerAiAuthHeaders,
  getTowerAiBaseUrl,
  logTowerAiProxyError,
  rejectNonFrontendAiRequest,
} from "@/lib/server/towerAiBackend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TTS_FETCH_TIMEOUT_MS = 55_000;
// Atlas audio_ids are opaque tokens; reject anything that isn't one before
// it reaches the backend.
const AUDIO_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Spoken version of an Atlas reply. /api/ai/chat returns an `audio_id` with
 * each speakable reply; the browser posts it here and gets audio/wav back.
 * Atlas only speaks replies it actually produced, so this can't be used as an
 * open text-to-speech service.
 */
export async function POST(request: NextRequest) {
  let ttsUrl: string | null = null;

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
    ttsUrl = `${backendUrl}/api/v1/tts`;

    const body = (await request.json().catch(() => null)) as {
      audio_id?: unknown;
    } | null;
    const audioId = typeof body?.audio_id === "string" ? body.audio_id.trim() : "";
    if (!AUDIO_ID_PATTERN.test(audioId)) {
      return NextResponse.json({ error: "audio_id is required" }, { status: 400 });
    }

    const response = await fetch(ttsUrl, {
      method: "POST",
      headers: getTowerAiAuthHeaders(),
      body: JSON.stringify({ audio_id: audioId }),
      cache: "no-store",
      signal: AbortSignal.timeout(TTS_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        detail?: unknown;
      } | null;
      const detail =
        typeof data?.detail === "string" && data.detail.trim()
          ? data.detail.trim()
          : "Could not generate audio";
      return NextResponse.json({ error: detail }, { status: response.status });
    }

    const audio = await response.arrayBuffer();
    return new NextResponse(audio, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logTowerAiProxyError("[api/ai/tts] proxy error", error, ttsUrl);
    const failure = classifyTowerAiFetchError(error);
    return NextResponse.json(
      { error: failure.error, message: failure.message },
      { status: failure.status },
    );
  }
}
