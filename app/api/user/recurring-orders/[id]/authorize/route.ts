import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/devApiSupabase";
import { walletError } from "@/lib/server/wallet";
import { requireOwnedWalletSession } from "@/lib/server/walletSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

async function resolveId(context: RouteContext) {
  const params = await context.params;
  return params.id;
}

/**
 * Dedicated path for post-authorization fields that must not be mass-assigned
 * via the generic PATCH allow-list.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const id = await resolveId(context);
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const { wallet, response } = requireOwnedWalletSession(request, body);
    if (response || !wallet) {
      return response ?? walletError("Wallet session required.", 401);
    }

    const authorizationHash =
      typeof body.authorization_transaction_hash === "string"
        ? body.authorization_transaction_hash.trim()
        : "";
    const onchainOrderKey =
      typeof body.onchain_order_key === "string"
        ? body.onchain_order_key.trim()
        : "";
    const executorAddress =
      typeof body.executor_address === "string"
        ? body.executor_address.trim().toLowerCase()
        : "";

    if (!authorizationHash || !onchainOrderKey || !executorAddress) {
      return walletError(
        "authorization_transaction_hash, onchain_order_key, and executor_address are required.",
      );
    }

    const updates: Record<string, unknown> = {
      onchain_order_key: onchainOrderKey,
      executor_address: executorAddress,
      authorization_transaction_hash: authorizationHash,
      onchain_authorized: true,
    };

    if (
      typeof body.approval_transaction_hash === "string" &&
      body.approval_transaction_hash.trim()
    ) {
      updates.approval_transaction_hash = body.approval_transaction_hash.trim();
    }

    const { data, error } = await supabaseAdmin
      .from("recurring_orders")
      .update(updates)
      .eq("id", id)
      .eq("wallet_address", wallet)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return walletError("Order not found for wallet.", 404);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(
      "POST /api/user/recurring-orders/[id]/authorize failed:",
      error,
    );
    return walletError(
      error instanceof Error ? error.message : "Failed to authorize order",
      500,
    );
  }
}
