import { NextRequest, NextResponse } from "next/server";
import { withFrontendOriginGate } from "@/lib/server/frontendRequestGuard";

export const dynamic = "force-dynamic";

export const POST = withFrontendOriginGate(async (_request: NextRequest) => {
  return NextResponse.json(
    {
      success: false,
      error: "FeeCollector fee submission is deprecated",
      details:
        "Platform fees are now collected inside TowerSwapExecutor.executeSwap, so no separate fee distribution request is needed.",
    },
    { status: 410 },
  );
});
