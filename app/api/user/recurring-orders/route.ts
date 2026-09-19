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
    const activeOnly = searchParams.get("activeOnly") !== "false";

    let query = supabaseAdmin
      .from("recurring_orders")
      .select("*")
      .eq("wallet_address", wallet);

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error("GET /api/user/recurring-orders failed:", error);
    return walletError(
      error instanceof Error ? error.message : "Failed to fetch recurring orders",
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

    const orderType =
      body.order_type === "buy" || body.order_type === "sell"
        ? body.order_type
        : null;
    if (!orderType) {
      return walletError("order_type must be buy or sell.");
    }

    const sourceToken =
      typeof body.source_token === "string" ? body.source_token : null;
    const targetToken =
      typeof body.target_token === "string" ? body.target_token : null;
    const amount =
      typeof body.amount === "number"
        ? body.amount
        : typeof body.amount === "string"
          ? Number.parseFloat(body.amount)
          : NaN;
    const frequency =
      typeof body.frequency === "string" ? body.frequency : null;

    if (!sourceToken || !targetToken || !frequency || !Number.isFinite(amount)) {
      return walletError(
        "source_token, target_token, amount, and frequency are required.",
      );
    }

    const row = {
      wallet_address: wallet,
      order_type: orderType,
      source_token: sourceToken,
      target_token: targetToken,
      amount,
      frequency,
      start_date:
        typeof body.start_date === "string"
          ? body.start_date
          : new Date().toISOString(),
      end_date: typeof body.end_date === "string" ? body.end_date : null,
      next_execution_date:
        typeof body.next_execution_date === "string"
          ? body.next_execution_date
          : typeof body.start_date === "string"
            ? body.start_date
            : new Date().toISOString(),
      is_active: body.is_active !== false,
    };

    const { data, error } = await supabaseAdmin
      .from("recurring_orders")
      .insert(row)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("POST /api/user/recurring-orders failed:", error);
    return walletError(
      error instanceof Error ? error.message : "Failed to create recurring order",
      500,
    );
  }
}
