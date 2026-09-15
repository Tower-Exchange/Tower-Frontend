import { NextRequest, NextResponse } from "next/server";
import { withFrontendOriginGate } from "@/lib/server/frontendRequestGuard";

const COINGECKO_PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,eurc,tether&vs_currencies=usd";

export async function getPricesResponse() {
  try {
    const response = await fetch(COINGECKO_PRICE_URL, {
      headers: {
        "accept": "application/json",
      },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch prices from CoinGecko" },
        { status: response.status },
      );
    }

    const prices = (await response.json()) as {
      "usd-coin"?: { usd?: number };
      eurc?: { usd?: number };
      tether?: { usd?: number };
    };

    return NextResponse.json(prices);
  } catch (error) {
    console.error("Failed to fetch CoinGecko prices", error);
    return NextResponse.json(
      { error: "Failed to fetch prices from CoinGecko" },
      { status: 502 },
    );
  }
}

export const GET = withFrontendOriginGate(async (_request: NextRequest) =>
  getPricesResponse(),
);
