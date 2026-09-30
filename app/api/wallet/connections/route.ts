import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAtlasAuthWhitelisted } from "@/lib/atlasAuth";

const EVM_WALLET_ADDRESS_PATTERN = /^0x[a-f0-9]{40}$/;

type WalletConnectionRequestBody = {
  walletAddress?: unknown;
  walletType?: unknown;
  chainId?: unknown;
  connectedAt?: unknown;
};

function createSupabaseRouteClient() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for wallet connection tracking.",
    );
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

const normalizeWalletAddress = (walletAddress: unknown) =>
  typeof walletAddress === "string" && walletAddress.trim()
    ? walletAddress.trim().toLowerCase()
    : null;

const normalizeWalletType = (walletType: unknown) => {
  if (typeof walletType !== "string") {
    return null;
  }

  const normalized = walletType.trim();
  return normalized ? normalized.slice(0, 120) : null;
};

const normalizeChainId = (chainId: unknown) => {
  if (typeof chainId === "number") {
    return Number.isInteger(chainId) && chainId >= 0 ? chainId : null;
  }

  if (typeof chainId === "string" && chainId.trim()) {
    const parsed = Number.parseInt(chainId, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  return null;
};

const normalizeConnectedAt = (connectedAt: unknown) => {
  if (typeof connectedAt !== "string" || !connectedAt.trim()) {
    return new Date().toISOString();
  }

  const parsed = new Date(connectedAt);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as WalletConnectionRequestBody;
    const walletAddress = normalizeWalletAddress(body.walletAddress);

    if (!walletAddress) {
      return NextResponse.json(
        { success: false, message: "Wallet address is required." },
        { status: 400 },
      );
    }

    if (!EVM_WALLET_ADDRESS_PATTERN.test(walletAddress)) {
      return NextResponse.json(
        { success: false, message: "Wallet address is invalid." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseRouteClient();
    const { data: existingAuth } = await supabase
      .from("wallet_connections")
      .select("authenticated")
      .eq("address", walletAddress)
      .eq("authenticated", true)
      .limit(1)
      .maybeSingle();

    const connectionRow = {
      address: walletAddress,
      wallet_type: normalizeWalletType(body.walletType),
      chain_id: normalizeChainId(body.chainId),
      connected_at: normalizeConnectedAt(body.connectedAt),
    };
    const shouldAuthenticate =
      Boolean(existingAuth?.authenticated) || isAtlasAuthWhitelisted(walletAddress);

    let { error } = await supabase.from("wallet_connections").insert({
      ...connectionRow,
      authenticated: shouldAuthenticate,
      authenticated_at: shouldAuthenticate ? new Date().toISOString() : null,
    });

    if (error?.message?.toLowerCase().includes("authenticated")) {
      const retry = await supabase.from("wallet_connections").insert(connectionRow);
      error = retry.error;
    }

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error tracking wallet connection:", error);

    const debug =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Internal server error";

    return NextResponse.json(
      {
        success: false,
        message: "Unable to track wallet connection right now.",
        debug,
      },
      { status: 500 },
    );
  }
}
