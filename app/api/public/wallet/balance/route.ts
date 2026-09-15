import { NextRequest, NextResponse } from "next/server";
import { withDevApiAuth, handleCorsPreflight } from "@/lib/server/devApiMiddleware";
import { handleWalletBalancePost } from "@/app/api/wallet/balance/route";

export const OPTIONS = handleCorsPreflight;

export const POST = withDevApiAuth(
  "/api/public/wallet/balance",
  { requiredScope: null, computeUnits: 1 },
  async (request: NextRequest) => {
    return handleWalletBalancePost(request);
  }
);

export function GET() {
  return NextResponse.json(
    { success: false, error: "Method GET not allowed. Use POST /api/public/wallet/balance.", status: 405 },
    { status: 405 }
  );
}
