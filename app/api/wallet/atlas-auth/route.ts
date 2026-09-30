import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createPublicClient,
  fallback,
  http,
  isHash,
  type Hex,
  type Transaction,
  type TransactionReceipt,
} from "viem";

import {
  ATLAS_AUTH_CHAIN_ID,
  getAtlasAuthFeeRecipient,
  getAtlasAuthFeeWei,
  isAtlasAuthWhitelisted,
} from "@/lib/atlasAuth";
import { ARC_MAINNET_CONFIG } from "@/lib/arcNetwork";
import { getArcMainnetRpcUrls } from "@/lib/arcRpc";
import { requireOwnedWalletSession } from "@/lib/server/walletSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TX_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const RECEIPT_ATTEMPTS = 40;
const RECEIPT_POLL_MS = 750;

type AtlasAuthRequestBody = {
  txHash?: unknown;
  walletAddress?: unknown;
};

type WalletConnectionAuthRow = {
  id: string;
  address: string;
  authenticated: boolean | null;
  auth_tx_hash: string | null;
};

function createSupabaseRouteClient() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for Atlas authentication.",
    );
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createAtlasAuthPublicClient() {
  const urls = getArcMainnetRpcUrls();
  if (urls.length === 0) {
    throw new Error("No Arc mainnet RPC endpoints configured.");
  }

  return createPublicClient({
    chain: {
      id: ATLAS_AUTH_CHAIN_ID,
      name: "Arc",
      nativeCurrency: {
        name: "USDC",
        symbol: "USDC",
        decimals: 18,
      },
      rpcUrls: {
        default: { http: urls },
      },
      blockExplorers: {
        default: {
          name: "Arc Explorer",
          url: ARC_MAINNET_CONFIG.explorerUrl,
        },
      },
    },
    transport:
      urls.length > 1
        ? fallback(urls.map((url) => http(url)))
        : http(urls[0]),
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeTxHash = (value: unknown) => {
  if (typeof value !== "string" || !TX_HASH_PATTERN.test(value.trim())) {
    return null;
  }

  const txHash = value.trim().toLowerCase() as Hex;
  return isHash(txHash) ? txHash : null;
};

async function waitForPaymentTransaction(txHash: Hex) {
  const client = createAtlasAuthPublicClient();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < RECEIPT_ATTEMPTS; attempt += 1) {
    try {
      const [receipt, transaction] = await Promise.all([
        client.getTransactionReceipt({ hash: txHash }),
        client.getTransaction({ hash: txHash }),
      ]);

      if (receipt && transaction) {
        return { receipt, transaction };
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(RECEIPT_POLL_MS);
  }

  throw new Error(
    lastError instanceof Error
      ? lastError.message
      : "Payment is still confirming on Arc. Try again in a moment.",
  );
}

const isSuccessfulReceipt = (receipt: TransactionReceipt) =>
  receipt.status === "success";

function assertValidAtlasPayment(params: {
  wallet: string;
  recipient: string;
  feeWei: bigint;
  transaction: Transaction;
  receipt: TransactionReceipt;
}) {
  const { wallet, recipient, feeWei, transaction, receipt } = params;

  if (!isSuccessfulReceipt(receipt)) {
    throw new Error("Atlas authentication payment failed on-chain.");
  }

  if (transaction.chainId && transaction.chainId !== ATLAS_AUTH_CHAIN_ID) {
    throw new Error("Atlas authentication must be paid on Arc mainnet.");
  }

  if (transaction.from.toLowerCase() !== wallet) {
    throw new Error("Payment was not sent from the connected wallet.");
  }

  if (!transaction.to || transaction.to.toLowerCase() !== recipient.toLowerCase()) {
    throw new Error("Payment was not sent to the Atlas authentication address.");
  }

  if (transaction.value < feeWei) {
    throw new Error("Payment amount is below the Atlas authentication fee.");
  }
}

async function findAuthenticatedRow(
  supabase: ReturnType<typeof createSupabaseRouteClient>,
  wallet: string,
) {
  const { data, error } = await supabase
    .from("wallet_connections")
    .select("id, address, authenticated, auth_tx_hash")
    .eq("address", wallet)
    .eq("authenticated", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as WalletConnectionAuthRow | null) ?? null;
}

async function findRowByAuthTxHash(
  supabase: ReturnType<typeof createSupabaseRouteClient>,
  txHash: string,
) {
  const { data, error } = await supabase
    .from("wallet_connections")
    .select("id, address, authenticated, auth_tx_hash")
    .eq("auth_tx_hash", txHash)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as WalletConnectionAuthRow | null) ?? null;
}

async function recordAtlasAuthentication(params: {
  supabase: ReturnType<typeof createSupabaseRouteClient>;
  wallet: string;
  txHash?: string | null;
}) {
  const { supabase, wallet, txHash } = params;
  const authenticatedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("wallet_connections")
    .update({
      authenticated: true,
      authenticated_at: authenticatedAt,
    })
    .eq("address", wallet);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { data: latest, error: latestError } = await supabase
    .from("wallet_connections")
    .select("id, auth_tx_hash")
    .eq("address", wallet)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw new Error(latestError.message);
  }

  if (!latest?.id) {
    const { error: insertError } = await supabase.from("wallet_connections").insert({
      address: wallet,
      authenticated: true,
      auth_tx_hash: txHash || null,
      authenticated_at: authenticatedAt,
      connected_at: authenticatedAt,
    });

    if (insertError) {
      throw new Error(insertError.message);
    }

    return;
  }

  if (!txHash || latest.auth_tx_hash) {
    return;
  }

  const { error: hashError } = await supabase
    .from("wallet_connections")
    .update({ auth_tx_hash: txHash })
    .eq("id", latest.id);

  if (hashError) {
    if (hashError.code === "23505") {
      const existing = await findRowByAuthTxHash(supabase, txHash);
      if (existing?.address === wallet) {
        return;
      }
    }

    throw new Error(hashError.message);
  }
}

export async function GET(request: NextRequest) {
  const session = requireOwnedWalletSession(request);
  if (session.response) {
    return session.response;
  }
  if (!session.wallet) {
    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        error: "Wallet session required. Please sign in.",
      },
      { status: 401 },
    );
  }

  try {
    const supabase = createSupabaseRouteClient();
    const whitelisted = isAtlasAuthWhitelisted(session.wallet);

    if (whitelisted) {
      try {
        const existing = await findAuthenticatedRow(supabase, session.wallet);
        if (!existing?.authenticated) {
          await recordAtlasAuthentication({
            supabase,
            wallet: session.wallet,
          });
        }
      } catch (persistError) {
        console.warn("[atlas-auth] whitelist persist failed:", persistError);
      }

      return NextResponse.json({
        success: true,
        authenticated: true,
        whitelisted: true,
      });
    }

    const existing = await findAuthenticatedRow(supabase, session.wallet);

    return NextResponse.json({
      success: true,
      authenticated: Boolean(existing?.authenticated),
    });
  } catch (error) {
    console.error("Atlas auth status failed:", error);
    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        error: "Unable to check Atlas authentication right now.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as AtlasAuthRequestBody;
  const session = requireOwnedWalletSession(request, body);
  if (session.response) {
    return session.response;
  }
  if (!session.wallet) {
    return NextResponse.json(
      {
        success: false,
        error: "Wallet session required. Please sign in.",
      },
      { status: 401 },
    );
  }

  if (isAtlasAuthWhitelisted(session.wallet)) {
    try {
      const supabase = createSupabaseRouteClient();
      await recordAtlasAuthentication({
        supabase,
        wallet: session.wallet,
      });
    } catch (persistError) {
      console.warn("[atlas-auth] whitelist persist failed:", persistError);
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      whitelisted: true,
    });
  }

  const txHash = normalizeTxHash(body.txHash);
  if (!txHash) {
    return NextResponse.json(
      {
        success: false,
        error: "A valid payment transaction hash is required.",
      },
      { status: 400 },
    );
  }

  try {
    const supabase = createSupabaseRouteClient();
    const alreadyAuthenticated = await findAuthenticatedRow(
      supabase,
      session.wallet,
    );

    if (alreadyAuthenticated?.authenticated) {
      return NextResponse.json({
        success: true,
        authenticated: true,
        txHash: alreadyAuthenticated.auth_tx_hash || txHash,
      });
    }

    const existingHashRow = await findRowByAuthTxHash(supabase, txHash);
    if (existingHashRow && existingHashRow.address !== session.wallet) {
      return NextResponse.json(
        {
          success: false,
          error: "This payment has already been used to authenticate a wallet.",
        },
        { status: 409 },
      );
    }

    if (existingHashRow?.address === session.wallet) {
      await recordAtlasAuthentication({
        supabase,
        wallet: session.wallet,
        txHash,
      });

      return NextResponse.json({
        success: true,
        authenticated: true,
        txHash,
      });
    }

    const { receipt, transaction } = await waitForPaymentTransaction(txHash);
    assertValidAtlasPayment({
      wallet: session.wallet,
      recipient: getAtlasAuthFeeRecipient(),
      feeWei: getAtlasAuthFeeWei(),
      transaction,
      receipt,
    });

    await recordAtlasAuthentication({
      supabase,
      wallet: session.wallet,
      txHash,
    });

    return NextResponse.json({
      success: true,
      authenticated: true,
      txHash,
    });
  } catch (error) {
    console.error("Atlas auth confirmation failed:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Unable to record Atlas authentication right now.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 400 },
    );
  }
}
