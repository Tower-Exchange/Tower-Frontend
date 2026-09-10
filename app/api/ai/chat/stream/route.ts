/**
 * Next.js API Route - Streaming Proxy to Tower-Exchange-AI Backend
 * Handles streaming responses from the backend
 */

import { NextRequest, NextResponse } from "next/server";
import { requireWalletSession } from "@/lib/server/walletSession";
import { normalizeWalletAddress } from "@/lib/server/wallet";
import {
  aiBackendUnconfiguredResponse,
  buildTowerAiChatRequestBody,
  classifyTowerAiFetchError,
  fetchTowerAi,
  getTowerAiStreamUrl,
  logTowerAiProxyError,
  rejectNonFrontendAiRequest,
  TOWER_AI_ROUTE_MAX_DURATION_SECONDS,
} from "@/lib/server/towerAiBackend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = TOWER_AI_ROUTE_MAX_DURATION_SECONDS;

const EVM_ADDRESS_IN_TEXT_PATTERN = /0x[a-fA-F0-9]{40}/g;

export async function POST(request: NextRequest) {
  let streamUrl: string | null = null;

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

    streamUrl = getTowerAiStreamUrl();
    if (!streamUrl) {
      return aiBackendUnconfiguredResponse();
    }

    const rawBody = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!rawBody || typeof rawBody !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const rawMessage =
      typeof rawBody.message === "string" ? rawBody.message : "";
    const sanitizedMessage = rawMessage.replace(
      EVM_ADDRESS_IN_TEXT_PATTERN,
      (match) => {
        const normalized = normalizeWalletAddress(match);
        return normalized && normalized === wallet ? match : wallet;
      },
    );

    const body = buildTowerAiChatRequestBody(rawBody, wallet, sanitizedMessage);

    const response = await fetchTowerAi(streamUrl, body);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: "AI stream failed",
      }));
      return NextResponse.json(errorData, { status: response.status });
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return NextResponse.json(
        { error: "Backend did not return a readable stream" },
        { status: 500 },
      );
    }

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              break;
            }
            controller.enqueue(value);
          }
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new NextResponse(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    logTowerAiProxyError("Streaming API Route Error:", error, streamUrl);
    const failure = classifyTowerAiFetchError(error);
    return NextResponse.json(
      { error: failure.error, message: failure.message },
      { status: failure.status },
    );
  }
}
