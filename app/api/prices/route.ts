import { NextRequest, NextResponse } from "next/server";
import { getAeroUsdSpotPrices } from "@/lib/aeroDex";
import { DEFAULT_TOKEN_USD_PRICES } from "@/lib/tokenUsdPrices";
import { withFrontendOriginGate } from "@/lib/server/frontendRequestGuard";

export async function getPricesResponse() {
  try {
    const aeroPrices = await getAeroUsdSpotPrices();
    const EURC = aeroPrices.EURC ?? DEFAULT_TOKEN_USD_PRICES.EURC;
    const cirBTC = aeroPrices.cirBTC ?? DEFAULT_TOKEN_USD_PRICES.cirBTC;

    return NextResponse.json({
      USDC: 1,
      EURC,
      USDT: DEFAULT_TOKEN_USD_PRICES.USDT,
      cirBTC,
      cNGN: DEFAULT_TOKEN_USD_PRICES.cNGN,
      QCAD: DEFAULT_TOKEN_USD_PRICES.QCAD,
      "usd-coin": { usd: 1 },
      eurc: { usd: EURC },
      tether: { usd: DEFAULT_TOKEN_USD_PRICES.USDT },
    });
  } catch (error) {
    console.error("Failed to fetch Aero DEX prices", error);
    return NextResponse.json(
      { error: "Failed to fetch Aero DEX prices" },
      { status: 502 },
    );
  }
}

export const GET = withFrontendOriginGate(async (_request: NextRequest) =>
  getPricesResponse(),
);
