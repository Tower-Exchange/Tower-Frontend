import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/devApiSupabase";
import { walletError } from "@/lib/server/wallet";
import { requireOwnedWalletSession } from "@/lib/server/walletSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Client-editable fields only — server-owned fields are rejected (finding 02). */
const ALLOWED_UPDATE_KEYS = new Set([
  "is_active",
  "amount",
  "frequency",
  "end_date",
  "next_execution_date",
]);
const IDENTITY_KEYS = new Set(["wallet_address", "walletAddress", "wallet"]);

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

async function resolveId(context: RouteContext) {
  const params = await context.params;
  return params.id;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { wallet, response } = requireOwnedWalletSession(request);
    if (response || !wallet) {
      return response ?? walletError("Wallet session required.", 401);
    }

    const id = await resolveId(context);

    const { data, error } = await supabaseAdmin
      .from("recurring_orders")
      .select("*")
      .eq("id", id)
      .eq("wallet_address", wallet)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return walletError("Order not found.", 404);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/user/recurring-orders/[id] failed:", error);
    return walletError(
      error instanceof Error ? error.message : "Failed to fetch recurring order",
      500,
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (IDENTITY_KEYS.has(key)) {
        continue;
      }
      if (!ALLOWED_UPDATE_KEYS.has(key)) {
        return walletError(`Field not allowed: ${key}`);
      }
      updates[key] = value;
    }

    if (Object.keys(updates).length === 0) {
      return walletError("No valid update fields provided.");
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
    console.error("PATCH /api/user/recurring-orders/[id] failed:", error);
    return walletError(
      error instanceof Error ? error.message : "Failed to update recurring order",
      500,
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { wallet, response } = requireOwnedWalletSession(request);
    if (response || !wallet) {
      return response ?? walletError("Wallet session required.", 401);
    }

    const id = await resolveId(context);

    const { data, error } = await supabaseAdmin
      .from("recurring_orders")
      .delete()
      .eq("id", id)
      .eq("wallet_address", wallet)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return walletError("Order not found for wallet.", 404);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/user/recurring-orders/[id] failed:", error);
    return walletError(
      error instanceof Error ? error.message : "Failed to delete recurring order",
      500,
    );
  }
}
