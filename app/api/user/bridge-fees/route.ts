import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/devApiSupabase";
import { walletError } from "@/lib/server/wallet";
import { requireOwnedWalletSession } from "@/lib/server/walletSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const { wallet, response } = requireOwnedWalletSession(request, body);
    if (response || !wallet) {
      return response ?? walletError("Wallet session required.", 401);
    }

    const row = {
      wallet_address: wallet,
      bridge_activity_id:
        typeof body.bridge_activity_id === "string"
          ? body.bridge_activity_id
          : null,
      from_chain: typeof body.from_chain === "string" ? body.from_chain : null,
      to_chain: typeof body.to_chain === "string" ? body.to_chain : null,
      source_token_address:
        typeof body.source_token_address === "string"
          ? body.source_token_address
          : null,
      destination_token_address:
        typeof body.destination_token_address === "string"
          ? body.destination_token_address
          : null,
      token_symbol:
        typeof body.token_symbol === "string" ? body.token_symbol : null,
      bridge_amount: body.bridge_amount ?? 0,
      platform_fee_amount: body.platform_fee_amount ?? 0,
      platform_fee_amount_usd: body.platform_fee_amount_usd ?? null,
      protocol_fee_amount: body.protocol_fee_amount ?? 0,
      protocol_fee_amount_usd: body.protocol_fee_amount_usd ?? null,
      total_fee_amount: body.total_fee_amount ?? 0,
      total_fee_amount_usd: body.total_fee_amount_usd ?? null,
      amount_received: body.amount_received ?? null,
      source_debit_total: body.source_debit_total ?? null,
      fee_type: typeof body.fee_type === "string" ? body.fee_type : "Flat",
      fee_basis_points: body.fee_basis_points ?? null,
      fee_recipient_address:
        typeof body.fee_recipient_address === "string"
          ? body.fee_recipient_address
          : null,
      protocol_provider:
        typeof body.protocol_provider === "string"
          ? body.protocol_provider
          : "Circle",
      transaction_hash:
        typeof body.transaction_hash === "string"
          ? body.transaction_hash
          : null,
      block_number:
        typeof body.block_number === "number" ? body.block_number : null,
      status:
        typeof body.status === "string" && body.status
          ? body.status
          : "Recorded",
      error_message:
        typeof body.error_message === "string" ? body.error_message : null,
    };

    if (!row.from_chain || !row.to_chain || !row.token_symbol) {
      return walletError("from_chain, to_chain, and token_symbol are required.");
    }

    const { data, error } = await supabaseAdmin
      .from("bridge_fees")
      .insert(row)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("POST /api/user/bridge-fees failed:", error);
    return walletError(
      error instanceof Error ? error.message : "Failed to register bridge fee",
      500,
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const { wallet, response } = requireOwnedWalletSession(request, body);
    if (response || !wallet) {
      return response ?? walletError("Wallet session required.", 401);
    }

    const id =
      request.nextUrl.searchParams.get("id") ||
      (typeof body.id === "string" ? body.id : null);
    if (!id) {
      return walletError("id is required.");
    }

    const { data, error } = await supabaseAdmin
      .from("bridge_fees")
      .delete()
      .eq("id", id)
      .eq("wallet_address", wallet)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return walletError("Bridge fee not found for wallet.", 404);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/user/bridge-fees failed:", error);
    return walletError(
      error instanceof Error ? error.message : "Failed to delete bridge fee",
      500,
    );
  }
}
