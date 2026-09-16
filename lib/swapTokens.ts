import type { StaticImageData } from "next/image";

import eurcLogo from "@/public/assets/eurc.svg";
import usdcLogo from "@/public/assets/usdc.svg";
import usdtLogo from "@/public/assets/usdt.svg";
import cirbtcLogo from "@/public/assets/cirbtc.svg";
import cngnLogo from "@/public/assets/cNGN.svg";
import qcadLogo from "@/public/assets/QCAD.svg";
import { DEFAULT_TOKEN_USD_PRICES } from "@/lib/tokenUsdPrices";

export const QCAD_SWAP_PAIRS_ENABLED = true;

export interface SwapToken {
  symbol: "USDC" | "EURC" | "USDT" | "cirBTC" | "cNGN" | "QCAD";
  icon: StaticImageData;
  name: string;
  balance: number;
  usdPrice: number;
}

export type SwapTokenSymbol = SwapToken["symbol"];

export const SWAP_TOKENS: readonly SwapToken[] = [
  {
    symbol: "USDC",
    icon: usdcLogo,
    name: "USD Coin",
    balance: 1000,
    usdPrice: DEFAULT_TOKEN_USD_PRICES.USDC,
  },
  {
    symbol: "EURC",
    icon: eurcLogo,
    name: "Euro Coin",
    balance: 750,
    usdPrice: DEFAULT_TOKEN_USD_PRICES.EURC,
  },
  {
    symbol: "USDT",
    icon: usdtLogo,
    name: "Tether USD",
    balance: 500,
    usdPrice: DEFAULT_TOKEN_USD_PRICES.USDT,
  },
  {
    symbol: "cirBTC",
    icon: cirbtcLogo,
    name: "Circle Bitcoin",
    balance: 0,
    usdPrice: DEFAULT_TOKEN_USD_PRICES.cirBTC,
  },
  // {
  //   symbol: "cNGN",
  //   icon: cngnLogo,
  //   name: "Compliant Naira",
  //   balance: 0,
  //   usdPrice: DEFAULT_TOKEN_USD_PRICES.cNGN,
  // },
  // {
  //   symbol: "QCAD",
  //   icon: qcadLogo,
  //   name: "Canadian Dollar",
  //   balance: 0,
  //   usdPrice: DEFAULT_TOKEN_USD_PRICES.QCAD,
  // },
] as const;

const QCAD_SWAP_PAIR_KEYS = QCAD_SWAP_PAIRS_ENABLED
  ? ([
      "USDC:QCAD",
      "QCAD:USDC",
      "USDT:QCAD",
      "QCAD:USDT",
      "EURC:QCAD",
      "QCAD:EURC",
      "CIRBTC:QCAD",
      "QCAD:CIRBTC",
      "CNGN:QCAD",
      "QCAD:CNGN",
    ] as const)
  : ([] as const);

const SUPPORTED_SWAP_PAIR_KEYS = new Set<string>([
  "USDC:EURC",
  "EURC:USDC",
  "USDC:USDT",
  "USDT:USDC",
  "USDT:EURC",
  "EURC:USDT",
  "USDC:CIRBTC",
  "CIRBTC:USDC",
  "USDT:CIRBTC",
  "CIRBTC:USDT",
  "EURC:CIRBTC",
  "CIRBTC:EURC",
  // "USDC:CNGN",
  // "CNGN:USDC",
  // "USDT:CNGN",
  // "CNGN:USDT",
  // "EURC:CNGN",
  // "CNGN:EURC",
  // "CIRBTC:CNGN",
  // "CNGN:CIRBTC",
  ...QCAD_SWAP_PAIR_KEYS,
]);

export function isSupportedSwapPair(
  tokenInSymbol?: string | null,
  tokenOutSymbol?: string | null,
) {
  if (!tokenInSymbol || !tokenOutSymbol) {
    return false;
  }

  return SUPPORTED_SWAP_PAIR_KEYS.has(
    `${tokenInSymbol.toUpperCase()}:${tokenOutSymbol.toUpperCase()}`,
  );
}

export function getSupportedCounterpartyTokens(
  tokenSymbol?: string | null,
  availableTokens: readonly SwapToken[] = SWAP_TOKENS,
): SwapToken[] {
  if (!tokenSymbol) {
    return [...availableTokens];
  }

  return availableTokens.filter(
    (token) =>
      token.symbol !== tokenSymbol &&
      isSupportedSwapPair(tokenSymbol, token.symbol),
  );
}

export function getSwapTokenBySymbol(
  symbol?: string | null,
  availableTokens: readonly SwapToken[] = SWAP_TOKENS,
): SwapToken | undefined {
  if (!symbol) {
    return undefined;
  }

  return availableTokens.find(
    (token) => token.symbol.toUpperCase() === symbol.toUpperCase(),
  );
}

export function buildSwapPath(params: {
  from?: string | null;
  to?: string | null;
}): string {
  const search = new URLSearchParams();
  const fromToken = getSwapTokenBySymbol(params.from);
  const toToken = getSwapTokenBySymbol(params.to);

  if (fromToken) {
    search.set("from", fromToken.symbol);
  }
  if (toToken) {
    search.set("to", toToken.symbol);
  }

  const query = search.toString();
  return query ? `/?${query}` : "/";
}
