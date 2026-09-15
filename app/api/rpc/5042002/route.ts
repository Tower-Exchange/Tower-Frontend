import { NextRequest, NextResponse } from "next/server";

import { ARC_RPC_ENDPOINTS } from "@/lib/arcRpc";
import { isFrontendBrowserRequest } from "@/lib/server/frontendRequestGuard";
import {
  getRpcClientIp,
  inspectRpcProxyRequest,
} from "@/lib/server/rpcProxyGuard";

export const dynamic = "force-dynamic";

const ARC_RPC_UPSTREAM_TIMEOUT_MS = 4_000;

const NULL_RESULT_FALLBACK_METHODS = new Set([
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
]);

const shouldTryNextRpcForNullResult = (
  requestBody: string,
  responseBody: string,
) => {
  try {
    const requestJson = JSON.parse(requestBody) as { method?: string };
    const responseJson = JSON.parse(responseBody) as { result?: unknown };

    return (
      typeof requestJson.method === "string" &&
      NULL_RESULT_FALLBACK_METHODS.has(requestJson.method) &&
      responseJson.result === null
    );
  } catch {
    return false;
  }
};

export async function GET() {
  return NextResponse.json({
    ok: true,
    chainId: "5042002",
    message: "Arc RPC proxy is available. Send JSON-RPC requests with POST.",
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const inspection = inspectRpcProxyRequest({
      chainId: "5042002",
      bodyText: body,
      clientIp: getRpcClientIp(request),
      allowBroadcast: isFrontendBrowserRequest(request),
    });
    if (!inspection.ok) {
      return inspection.response;
    }

    let lastError: unknown = null;

    for (const rpcUrl of ARC_RPC_ENDPOINTS) {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        ARC_RPC_UPSTREAM_TIMEOUT_MS,
      );

      try {
        const upstreamResponse = await fetch(rpcUrl, {
          method: "POST",
          headers: {
            "content-type":
              request.headers.get("content-type") ?? "application/json",
          },
          body,
          cache: "no-store",
          signal: controller.signal,
        });

        if (!upstreamResponse.ok && ARC_RPC_ENDPOINTS.length > 1) {
          lastError = new Error(
            `Arc RPC ${rpcUrl} returned HTTP ${upstreamResponse.status}`,
          );
          continue;
        }

        const responseBody = await upstreamResponse.text();

        if (
          ARC_RPC_ENDPOINTS.length > 1 &&
          shouldTryNextRpcForNullResult(body, responseBody) &&
          rpcUrl !== ARC_RPC_ENDPOINTS[ARC_RPC_ENDPOINTS.length - 1]
        ) {
          lastError = new Error(
            `Arc RPC ${rpcUrl} returned null transaction result`,
          );
          continue;
        }

        return new NextResponse(responseBody, {
          status: upstreamResponse.status,
          headers: {
            "cache-control": "no-store",
            "content-type":
              upstreamResponse.headers.get("content-type") ??
              "application/json",
          },
        });
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError ?? new Error("All Arc RPC endpoints failed");
  } catch (error) {
    console.error("Arc RPC proxy error:", error);

    return NextResponse.json(
      { error: "Failed to reach Arc RPC endpoint" },
      { status: 502 },
    );
  }
}