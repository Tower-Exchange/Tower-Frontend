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
    const sessionId = searchParams.get("sessionId");
    if (!sessionId) {
      return walletError("sessionId is required.");
    }

    const { data, error } = await supabaseAdmin
      .from("ai_db")
      .select("created_at, user_query, ai_response")
      .eq("session_id", sessionId)
      .eq("user_id", wallet)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error("GET /api/user/ai-history failed:", error);
    return walletError(
      error instanceof Error ? error.message : "Failed to fetch AI history",
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

    const sessionId =
      typeof body.session_id === "string"
        ? body.session_id
        : typeof body.sessionId === "string"
          ? body.sessionId
          : null;
    const userQuery =
      typeof body.user_query === "string"
        ? body.user_query
        : typeof body.userQuery === "string"
          ? body.userQuery
          : null;
    const aiResponse =
      typeof body.ai_response === "string"
        ? body.ai_response
        : typeof body.aiResponse === "string"
          ? body.aiResponse
          : null;

    if (!sessionId || userQuery == null || aiResponse == null) {
      return walletError("session_id, user_query, and ai_response are required.");
    }

    const { data, error } = await supabaseAdmin
      .from("ai_db")
      .insert({
        user_id: wallet,
        session_id: sessionId,
        user_query: userQuery,
        ai_response: aiResponse,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("POST /api/user/ai-history failed:", error);
    return walletError(
      error instanceof Error ? error.message : "Failed to save AI history",
      500,
    );
  }
}
