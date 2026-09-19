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
    const orderId = searchParams.get("orderId");

    let query = supabaseAdmin
      .from("recurring_order_executions")
      .select("*")
      .eq("wallet_address", wallet);

    if (orderId) {
      query = query.eq("recurring_order_id", orderId);
    }

    const { data, error } = await query.order("execution_date", {
      ascending: false,
    });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error("GET /api/user/recurring-order-executions failed:", error);
    return walletError(
      error instanceof Error ? error.message : "Failed to fetch executions",
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

    const recurringOrderId =
      typeof body.recurring_order_id === "string"
        ? body.recurring_order_id
        : null;
    if (!recurringOrderId) {
      return walletError("recurring_order_id is required.");
    }

    const { data: ownedOrder, error: ownershipError } = await supabaseAdmin
      .from("recurring_orders")
      .select("id")
      .eq("id", recurringOrderId)
      .eq("wallet_address", wallet)
      .maybeSingle();

    if (ownershipError) {
      throw new Error(ownershipError.message);
    }
    if (!ownedOrder) {
      return walletError("Order not found for wallet.", 404);
    }

    const row = {
      recurring_order_id: recurringOrderId,
      wallet_address: wallet,
      amount:
        typeof body.amount === "number"
          ? body.amount
          : Number.parseFloat(String(body.amount ?? "0")),
      source_amount_usd: body.source_amount_usd ?? null,
      target_amount: body.target_amount ?? null,
      target_amount_usd: body.target_amount_usd ?? null,
      source_token:
        typeof body.source_token === "string" ? body.source_token : "",
      target_token:
        typeof body.target_token === "string" ? body.target_token : "",
      status:
        body.status === "Successful" ||
        body.status === "Failed" ||
        body.status === "Pending"
          ? body.status
          : "Pending",
      transaction_hash:
        typeof body.transaction_hash === "string"
          ? body.transaction_hash
          : null,
      error_message:
        typeof body.error_message === "string" ? body.error_message : null,
      execution_date:
        typeof body.execution_date === "string"
          ? body.execution_date
          : new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("recurring_order_executions")
      .insert(row)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("POST /api/user/recurring-order-executions failed:", error);
    return walletError(
      error instanceof Error ? error.message : "Failed to log execution",
      500,
    );
  }
}
