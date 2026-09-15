import { NextRequest, NextResponse } from "next/server";
import { withDevApiAuth, handleCorsPreflight } from "@/lib/server/devApiMiddleware";
import { handleSwapQuotePost } from "@/app/api/swap/quote/route";
import {
  SWAP_API_ERROR_CODES,
  enrichPublicSwapQuote,
  withSwapApiErrorCode,
} from "@/lib/swapApiContract";

export const OPTIONS = handleCorsPreflight;

const jsonFromInternal = async (response: NextResponse) => {
  const payload = (await response.json()) as Record<string, unknown>;
  return { payload, status: response.status };
};

export const POST = withDevApiAuth(
  "/api/public/swap/quote",
  { requiredScope: "swaps", computeUnits: 2 },
  async (request: NextRequest) => {
    const internalResponse = await handleSwapQuotePost(request);
    const { payload, status } = await jsonFromInternal(internalResponse);

    if (payload.success !== true) {
      return NextResponse.json(withSwapApiErrorCode(payload, status), { status });
    }

    return NextResponse.json(
      {
        ...payload,
        data: enrichPublicSwapQuote(payload.data),
      },
      { status },
    );
  }
);

export function GET() {
  return NextResponse.json(
    {
      success: false,
      error: "Method GET not allowed. Use POST /api/public/swap/quote.",
      code: SWAP_API_ERROR_CODES.METHOD_NOT_ALLOWED,
      status: 405,
    },
    { status: 405 }
  );
}
