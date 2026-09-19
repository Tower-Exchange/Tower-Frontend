import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { normalizeWalletAddress, walletError } from "@/lib/server/wallet";

export const WALLET_SESSION_COOKIE = "tower_wallet_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const NONCE_TTL_SECONDS = 60 * 5; // 5 minutes

type SignedPayload = {
  w: string;
  n: string;
  exp: number;
  typ: "session" | "nonce";
};

function getSessionSecret() {
  const secret =
    process.env.WALLET_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";

  if (!secret) {
    throw new Error(
      "Missing WALLET_SESSION_SECRET (or SUPABASE_SERVICE_ROLE_KEY fallback) for wallet sessions.",
    );
  }

  return secret;
}

function encodePayload(payload: SignedPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getSessionSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

function decodePayload(token: string): SignedPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) {
    return null;
  }

  const expected = createHmac("sha256", getSessionSecret())
    .update(body)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SignedPayload;

    if (
      !parsed ||
      typeof parsed.w !== "string" ||
      typeof parsed.n !== "string" ||
      typeof parsed.exp !== "number" ||
      (parsed.typ !== "session" && parsed.typ !== "nonce")
    ) {
      return null;
    }

    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function buildWalletLoginMessage(walletAddress: string, nonce: string) {
  return [
    "Sign in to Tower Exchange",
    "",
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    "",
    "This signature proves you control this wallet. It does not submit a blockchain transaction or cost gas.",
  ].join("\n");
}

export function issueWalletNonce(walletAddress: string) {
  const wallet = normalizeWalletAddress(walletAddress);
  if (!wallet) {
    throw new Error("Invalid wallet address");
  }

  const nonce = randomBytes(16).toString("hex");
  const token = encodePayload({
    w: wallet,
    n: nonce,
    exp: Math.floor(Date.now() / 1000) + NONCE_TTL_SECONDS,
    typ: "nonce",
  });

  return {
    wallet,
    nonce,
    token,
    message: buildWalletLoginMessage(wallet, nonce),
    expiresInSeconds: NONCE_TTL_SECONDS,
  };
}

export async function verifyWalletLogin(params: {
  walletAddress: string;
  signature: string;
  nonceToken: string;
}) {
  const wallet = normalizeWalletAddress(params.walletAddress);
  if (!wallet) {
    return { ok: false as const, error: "Invalid wallet address" };
  }

  const noncePayload = decodePayload(params.nonceToken);
  if (!noncePayload || noncePayload.typ !== "nonce") {
    return { ok: false as const, error: "Nonce expired or invalid" };
  }

  if (noncePayload.w !== wallet) {
    return { ok: false as const, error: "Nonce wallet mismatch" };
  }

  const message = buildWalletLoginMessage(wallet, noncePayload.n);
  const valid = await verifyMessage({
    address: wallet as `0x${string}`,
    message,
    signature: params.signature as `0x${string}`,
  });

  if (!valid) {
    return { ok: false as const, error: "Invalid signature" };
  }

  const sessionToken = encodePayload({
    w: wallet,
    n: randomBytes(8).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    typ: "session",
  });

  return {
    ok: true as const,
    wallet,
    sessionToken,
    expiresInSeconds: SESSION_TTL_SECONDS,
  };
}

export function readWalletSession(
  request: NextRequest,
): { wallet: string } | null {
  const cookieToken = request.cookies.get(WALLET_SESSION_COOKIE)?.value;
  const headerToken = request.headers.get("x-tower-wallet-session");
  const token = cookieToken || headerToken;

  if (!token) {
    return null;
  }

  const payload = decodePayload(token);
  if (!payload || payload.typ !== "session") {
    return null;
  }

  return { wallet: payload.w };
}

export function requireWalletSession(request: NextRequest) {
  try {
    const session = readWalletSession(request);
    if (!session) {
      return {
        wallet: null as string | null,
        response: walletError("Wallet session required. Please sign in.", 401),
      };
    }

    return { wallet: session.wallet, response: null as ReturnType<typeof walletError> | null };
  } catch (error) {
    console.error("Wallet session check failed:", error);
    return {
      wallet: null as string | null,
      response: walletError("Wallet session unavailable.", 500),
    };
  }
}

const CLAIMED_WALLET_KEYS = ["walletAddress", "wallet_address", "wallet"] as const;

function firstClaimedWalletValue(
  request: NextRequest,
  body?: Record<string, unknown> | null,
) {
  const searchParams = request.nextUrl.searchParams;
  const candidates: unknown[] = [
    searchParams.get("walletAddress"),
    searchParams.get("wallet_address"),
    searchParams.get("wallet"),
  ];

  if (body) {
    for (const key of CLAIMED_WALLET_KEYS) {
      candidates.push(body[key]);
    }
  }

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

/**
 * Require a signed wallet session and reject spoofed body/query wallets.
 * Identity is always the session wallet; a matching claimed wallet is allowed.
 */
export function requireOwnedWalletSession(
  request: NextRequest,
  body?: Record<string, unknown> | null,
) {
  const session = requireWalletSession(request);
  if (session.response || !session.wallet) {
    return session;
  }

  const claimedRaw = firstClaimedWalletValue(request, body);
  if (!claimedRaw) {
    return session;
  }

  const claimed = normalizeWalletAddress(claimedRaw);
  if (!claimed || claimed !== session.wallet) {
    return {
      wallet: null as string | null,
      response: walletError(
        "Wallet session does not match requested wallet.",
        403,
      ),
    };
  }

  return session;
}

export function attachWalletSessionCookie(
  response: NextResponse,
  sessionToken: string,
  maxAge = SESSION_TTL_SECONDS,
) {
  response.cookies.set({
    name: WALLET_SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  return response;
}

export function clearWalletSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: WALLET_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
