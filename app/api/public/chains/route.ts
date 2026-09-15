import { NextResponse } from "next/server";
import { withDevApiAuth, handleCorsPreflight } from "@/lib/server/devApiMiddleware";
import { getChainsResponse } from "@/app/api/chains/route";

export const OPTIONS = handleCorsPreflight;

export const GET = withDevApiAuth(
  "/api/public/chains",
  { requiredScope: null, computeUnits: 1 },
  async () => {
    return getChainsResponse();
  }
);

export function POST() {
  return NextResponse.json(
    { success: false, error: "Method POST not allowed. Use GET /api/public/chains.", status: 405 },
    { status: 405 }
  );
}
