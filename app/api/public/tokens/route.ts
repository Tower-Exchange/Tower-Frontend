import { NextResponse } from "next/server";
import { withDevApiAuth, handleCorsPreflight } from "@/lib/server/devApiMiddleware";
import { getTokensResponse } from "@/app/api/tokens/route";

export const OPTIONS = handleCorsPreflight;

export const GET = withDevApiAuth(
  "/api/public/tokens",
  { requiredScope: null, computeUnits: 1 },
  async () => {
    return getTokensResponse();
  }
);

export function POST() {
  return NextResponse.json(
    {
      success: false,
      error: "Method POST not allowed. Use GET /api/public/tokens.",
      code: "METHOD_NOT_ALLOWED",
      status: 405,
    },
    { status: 405 }
  );
}
