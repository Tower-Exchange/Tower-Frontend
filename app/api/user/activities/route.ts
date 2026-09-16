import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/devApiSupabase";
import { walletError } from "@/lib/server/wallet";
import { requireWalletSession } from "@/lib/server/walletSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { wallet, response } = requireWalletSession(request);
    if (response || !wallet) {
      return response ?? walletError("Wallet session required.", 401);
    }

    const { searchParams } = new URL(request.url);
    const limitRaw = Number.parseInt(searchParams.get("limit") || "100", 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 500)
      : 100;
    const ascending = searchParams.get("ascending") === "true";

    const { data, error } = await supabaseAdmin
      .from("activities")
      .select("*")
      .eq("wallet_address", wallet)
      .order("timestamp", { ascending })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error("GET /api/user/activities failed:", error);
    return walletError(
      error instanceof Error ? error.message : "Failed to fetch activities",
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { wallet, response } = requireWalletSession(request);
    if (response || !wallet) {
      return response ?? walletError("Wallet session required.", 401);
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    const type =
      typeof body.type === "string" && body.type.trim() ? body.type.trim() : null;
    if (!type) {
      return walletError("Activity type is required.");
    }

    const row = {
      wallet_address: wallet,
      type,
      source_currency_ticker:
        typeof body.source_currency_ticker === "string"
          ? body.source_currency_ticker
          : null,
      destination_currency_ticker:
        typeof body.destination_currency_ticker === "string"
          ? body.destination_currency_ticker
          : null,
      source_network_name:
        typeof body.source_network_name === "string"
          ? body.source_network_name
          : null,
      destination_network_name:
        typeof body.destination_network_name === "string"
          ? body.destination_network_name
          : null,
      destination_address:
        typeof body.destination_address === "string" && body.destination_address.trim()
          ? body.destination_address.trim()
          : null,
      status:
        typeof body.status === "string" && body.status.trim()
          ? body.status
          : "Successful",
      amount:
        typeof body.amount === "number"
          ? body.amount
          : typeof body.amount === "string"
            ? Number.parseFloat(body.amount)
            : null,
      amount_usd:
        typeof body.amount_usd === "number"
          ? body.amount_usd
          : typeof body.amount_usd === "string"
            ? Number.parseFloat(body.amount_usd)
            : null,
      fee:
        typeof body.fee === "number"
          ? body.fee
          : typeof body.fee === "string"
            ? Number.parseFloat(body.fee)
            : null,
      fee_currency_ticker:
        typeof body.fee_currency_ticker === "string"
          ? body.fee_currency_ticker
          : null,
      transaction_hash:
        typeof body.transaction_hash === "string"
          ? body.transaction_hash
          : null,
      timestamp:
        typeof body.timestamp === "string" && body.timestamp
          ? body.timestamp
          : new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("activities")
      .insert(row)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("POST /api/user/activities failed:", error);
    return walletError(
      error instanceof Error ? error.message : "Failed to insert activity",
      500,
    );
  }
}
