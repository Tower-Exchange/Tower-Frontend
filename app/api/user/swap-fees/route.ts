import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/devApiSupabase";
import { walletError } from "@/lib/server/wallet";
import { requireOwnedWalletSession } from "@/lib/server/walletSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { wallet, response } = requireOwnedWalletSession(request);
    if (response || !wallet) {
      return response ?? walletError("Wallet session required.", 401);
    }

    const { searchParams } = new URL(request.url);
    const limitRaw = Number.parseInt(searchParams.get("limit") || "50", 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 200)
      : 50;

    const { data, error } = await supabaseAdmin
      .from("swap_fees")
      .select("*")
      .eq("wallet_address", wallet)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error("GET /api/user/swap-fees failed:", error);
    return walletError(
      error instanceof Error ? error.message : "Failed to fetch swap fees",
      500,
    );
  }
}

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
      token_address:
        typeof body.token_address === "string"
          ? body.token_address.toLowerCase()
          : null,
      token_symbol:
        typeof body.token_symbol === "string" ? body.token_symbol : null,
      fee_amount: body.fee_amount ?? null,
      fee_amount_usd: body.fee_amount_usd ?? null,
      fee_basis_points: body.fee_basis_points ?? null,
      total_amount: body.total_amount ?? null,
      transaction_hash:
        typeof body.transaction_hash === "string"
          ? body.transaction_hash
          : null,
      block_number:
        typeof body.block_number === "number" ? body.block_number : null,
      swap_activity_id:
        typeof body.swap_activity_id === "string"
          ? body.swap_activity_id
          : null,
      status:
        typeof body.status === "string" && body.status
          ? body.status
          : "Recorded",
      error_message:
        typeof body.error_message === "string" ? body.error_message : null,
    };

    if (!row.token_address || !row.token_symbol) {
      return walletError("token_address and token_symbol are required.");
    }

    const { data, error } = await supabaseAdmin
      .from("swap_fees")
      .insert(row)
      .select("*");

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, data: data?.[0] ?? null });
  } catch (error) {
    console.error("POST /api/user/swap-fees failed:", error);
    return walletError(
      error instanceof Error ? error.message : "Failed to register swap fee",
      500,
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const { wallet, response } = requireOwnedWalletSession(request, body);
    if (response || !wallet) {
      return response ?? walletError("Wallet session required.", 401);
    }

    const feeId = typeof body.feeId === "string" ? body.feeId : null;
    const transactionHash =
      typeof body.transactionHash === "string" ? body.transactionHash : null;
    const blockNumber =
      typeof body.blockNumber === "number" ? body.blockNumber : null;

    if (!feeId || !transactionHash || blockNumber == null) {
      return walletError("feeId, transactionHash, and blockNumber are required.");
    }

    const { data, error } = await supabaseAdmin
      .from("swap_fees")
      .update({
        transaction_hash: transactionHash,
        block_number: blockNumber,
        status: "Confirmed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", feeId)
      .eq("wallet_address", wallet)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return walletError("Swap fee not found for wallet.", 404);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/user/swap-fees failed:", error);
    return walletError(
      error instanceof Error ? error.message : "Failed to update swap fee",
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
      (typeof body.id === "string"
        ? body.id
        : typeof body.feeId === "string"
          ? body.feeId
          : null);
    if (!id) {
      return walletError("id is required.");
    }

    const { data, error } = await supabaseAdmin
      .from("swap_fees")
      .delete()
      .eq("id", id)
      .eq("wallet_address", wallet)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return walletError("Swap fee not found for wallet.", 404);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/user/swap-fees failed:", error);
    return walletError(
      error instanceof Error ? error.message : "Failed to delete swap fee",
      500,
    );
  }
}
