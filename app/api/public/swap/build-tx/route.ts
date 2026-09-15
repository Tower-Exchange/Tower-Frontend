import { NextRequest, NextResponse } from "next/server";
import { withDevApiAuth, handleCorsPreflight } from "@/lib/server/devApiMiddleware";
import { handleSwapBuildTxPost } from "@/app/api/swap/build-tx/route";
import {
  SWAP_API_ERROR_CODES,
  enrichPublicBuildTxData,
  getExpiredQuoteError,
  withSwapApiErrorCode,
} from "@/lib/swapApiContract";

export const OPTIONS = handleCorsPreflight;

const jsonFromInternal = async (response: NextResponse) => {
  const payload = (await response.json()) as Record<string, unknown>;
  return { payload, status: response.status };
};

export const POST = withDevApiAuth(
  "/api/public/swap/build-tx",
  { requiredScope: "swaps", computeUnits: 3 },
  async (request: NextRequest) => {
    try {
      const cloned = request.clone();
      const body = await cloned.json().catch(() => null);

      if (!body || typeof body !== "object") {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid JSON request body",
            code: SWAP_API_ERROR_CODES.INVALID_REQUEST,
          },
          { status: 400 }
        );
      }

      const expiredQuote = getExpiredQuoteError(
        (body as { quote?: unknown }).quote,
      );
      if (expiredQuote) {
        return NextResponse.json(expiredQuote, { status: 400 });
      }
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request payload",
          code: SWAP_API_ERROR_CODES.INVALID_REQUEST,
        },
        { status: 400 }
      );
    }

    const internalResponse = await handleSwapBuildTxPost(request);
    const { payload, status } = await jsonFromInternal(internalResponse);

    if (payload.success !== true) {
      return NextResponse.json(withSwapApiErrorCode(payload, status), { status });
    }

    return NextResponse.json(
      {
        ...payload,
        data: enrichPublicBuildTxData(payload.data),
      },
      { status },
    );
  }
);

export function GET() {
  return NextResponse.json(
    {
      success: false,
      error: "Method GET not allowed. Use POST /api/public/swap/build-tx.",
      code: SWAP_API_ERROR_CODES.METHOD_NOT_ALLOWED,
      status: 405,
    },
    { status: 405 }
  );
}
