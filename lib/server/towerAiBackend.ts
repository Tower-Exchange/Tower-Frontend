import { NextRequest, NextResponse } from "next/server";
import { rejectNonFrontendRequest } from "@/lib/server/frontendRequestGuard";

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const getConfiguredBaseUrl = () => {
  const raw = (
    process.env.TOWER_AI_API ||
    process.env.TOWER_AI_API_URL ||
    ""
  ).trim();

  if (!raw) {
    return null;
  }

  return stripTrailingSlash(raw).replace(/\/api\/v1\/chat$/i, "");
};

export function getTowerAiBaseUrl() {
  return getConfiguredBaseUrl();
}

export function getTowerAiChatUrl() {
  const raw = (process.env.TOWER_AI_API || process.env.TOWER_AI_API_URL || "").trim();
  if (!raw) {
    return null;
  }

  const normalized = stripTrailingSlash(raw);
  if (/\/api\/v1\/chat$/i.test(normalized)) {
    return normalized;
  }

  return `${normalized}/api/v1/chat`;
}

export function getTowerAiStreamUrl() {
  const chatUrl = getTowerAiChatUrl();
  return chatUrl ? `${chatUrl}/stream` : null;
}

export function getTowerAiAuthHeaders(): Record<string, string> {
  const apiKey = (process.env.TOWER_AI_API_KEY || "").trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers.endpoint_auth = apiKey;
  }

  return headers;
}

/** Platform timeout budget in seconds. Route `maxDuration` must copy this as a numeric literal. */
export const TOWER_AI_ROUTE_MAX_DURATION_SECONDS = 120;
/** Abort before the platform kills the function so the client gets a 504. */
export const TOWER_AI_FETCH_TIMEOUT_MS = 110_000;

export type TowerAiProxyFailure = {
  status: number;
  error: string;
  message: string;
};

export function getTowerAiHostForLogs(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

const collectErrorText = (error: unknown, depth = 0): string => {
  if (depth > 4 || error == null) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    const cause =
      "cause" in error ? collectErrorText(error.cause, depth + 1) : "";
    return `${error.name} ${error.message} ${cause}`.trim();
  }

  return String(error);
};

export function classifyTowerAiFetchError(error: unknown): TowerAiProxyFailure {
  const combined = collectErrorText(error).toLowerCase();

  if (
    combined.includes("aborterror") ||
    combined.includes("timeouterror") ||
    combined.includes("aborted") ||
    combined.includes("timeout") ||
    combined.includes("the operation was aborted")
  ) {
    return {
      status: 504,
      error: "AI request timed out",
      message: "The AI is taking too long to respond. Please try again.",
    };
  }

  if (
    combined.includes("fetch failed") ||
    combined.includes("econnrefused") ||
    combined.includes("enotfound") ||
    combined.includes("econnreset") ||
    combined.includes("eai_again") ||
    combined.includes("cert") ||
    combined.includes("ssl") ||
    combined.includes("network") ||
    combined.includes("socket")
  ) {
    return {
      status: 502,
      error: "Unable to reach AI service",
      message: "Unable to reach the AI service. Please try again.",
    };
  }

  return {
    status: 500,
    error: "Failed to send message",
    message: "Failed to send message",
  };
}

export function logTowerAiProxyError(
  scope: string,
  error: unknown,
  url?: string | null,
) {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(scope, {
    name: err.name,
    message: err.message,
    cause:
      err.cause instanceof Error
        ? err.cause.message
        : err.cause
          ? String(err.cause)
          : undefined,
    host: url ? getTowerAiHostForLogs(url) : undefined,
  });
}

export async function fetchTowerAi(
  url: string,
  body: unknown,
  timeoutMs = TOWER_AI_FETCH_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeoutError = Object.assign(new Error("AI request timed out"), {
    name: "TimeoutError",
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(timeoutError);
    }, timeoutMs);
  });

  const fetchPromise = fetch(url, {
    method: "POST",
    headers: {
      ...getTowerAiAuthHeaders(),
      Connection: "close",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: controller.signal,
  });
  // Abort is ignored by some hung TLS sockets; still surface a timeout.
  void fetchPromise.catch(() => undefined);

  try {
    return await Promise.race([fetchPromise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

const asTrimmedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const asFiniteInt = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }

  return fallback;
};

/**
 * Forward only fields the Python ChatRequest model accepts.
 * Extra camelCase keys from the browser are ignored by Pydantic today, but
 * they used to leak into the upstream POST and can 422 if extra=forbid.
 */
export function buildTowerAiChatRequestBody(
  payload: Record<string, unknown>,
  wallet: string,
  message: string,
) {
  const sessionId = asTrimmedString(payload.session_id);
  const signature = asTrimmedString(payload.wallet_signature);
  const timestamp = asTrimmedString(payload.wallet_signature_timestamp);

  const body: Record<string, unknown> = {
    message,
    userid: wallet,
    session_id: sessionId,
    wallet_address: wallet,
    chain_id: asFiniteInt(payload.chain_id, 5042002),
    enable_wallet_access: payload.enable_wallet_access === true,
    enable_swap_execution: payload.enable_swap_execution === true,
    enable_bridge_execution: payload.enable_bridge_execution === true,
    enable_portfolio_analysis: payload.enable_portfolio_analysis === true,
  };

  if (signature.startsWith("0x") && timestamp) {
    body.wallet_signature = signature;
    body.wallet_signature_timestamp = timestamp;
  }

  return body;
}

/**
 * Reject terminal/curl callers that are not a browser request from the
 * Tower frontend. Wallet session is still required on each AI route.
 */
export function rejectNonFrontendAiRequest(request: NextRequest) {
  return rejectNonFrontendRequest(request);
}

export function aiBackendUnconfiguredResponse() {
  return NextResponse.json(
    { error: "AI is temporarily unavailable" },
    { status: 503 },
  );
}
