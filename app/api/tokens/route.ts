import { NextRequest, NextResponse } from "next/server";
import { TOKEN_CONTRACTS, TOKEN_DECIMALS } from "@/lib/arcNetwork";
import { withFrontendOriginGate } from "@/lib/server/frontendRequestGuard";

const SUPPORTED_TOKENS = [
  {
    symbol: "USDC",
    name: "USD Coin",
    decimals: TOKEN_DECIMALS.USDC ?? 6,
    address: TOKEN_CONTRACTS.USDC,
    isNativeGas: true,
    chainId: 5042002,
    chainKey: "arc-testnet",
    bridgeAddresses: {
      "arc-testnet": "0x3600000000000000000000000000000000000000",
      "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "optimism-sepolia": "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
      "avalanche-fuji": "0x5425890298aed601595a70ab815c96711a31bc65",
      "arbitrum-sepolia": "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
      "ethereum-sepolia": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      "linea-sepolia": "0xfece4462d57bd51a6a552365a011b95f0e16d9b7",
      "polygon-amoy": "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582",
      "sonic-testnet": "0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51",
      "unichain-sepolia": "0x31d0220469e10c4E71834a79b1f276d740d3768F",
      solana: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    },
  },
  {
    symbol: "EURC",
    name: "Euro Coin",
    decimals: TOKEN_DECIMALS.EURC ?? 6,
    address: TOKEN_CONTRACTS.EURC,
    isNativeGas: false,
    chainId: 5042002,
    chainKey: "arc-testnet",
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    decimals: TOKEN_DECIMALS.USDT ?? 18,
    address: TOKEN_CONTRACTS.USDT,
    isNativeGas: false,
    chainId: 5042002,
    chainKey: "arc-testnet",
  },
  {
    symbol: "cirBTC",
    name: "Circle Wrapped Bitcoin",
    decimals: TOKEN_DECIMALS.cirBTC ?? 8,
    address: TOKEN_CONTRACTS.cirBTC,
    isNativeGas: false,
    chainId: 5042002,
    chainKey: "arc-testnet",
  },
  {
    symbol: "USYC",
    name: "Hashnote US Yield Coin",
    decimals: TOKEN_DECIMALS.USYC ?? 6,
    address: TOKEN_CONTRACTS.USYC,
    isNativeGas: false,
    chainId: 5042002,
    chainKey: "arc-testnet",
  },
  {
    symbol: "QTM",
    name: "Quantum Token",
    decimals: TOKEN_DECIMALS.QTM ?? 18,
    address: TOKEN_CONTRACTS.QTM,
    isNativeGas: false,
    chainId: 5042002,
    chainKey: "arc-testnet",
  },
  {
    symbol: "SWPRC",
    name: "SwapArc Token",
    decimals: TOKEN_DECIMALS.SWPRC ?? 6,
    address: TOKEN_CONTRACTS.SWPRC,
    isNativeGas: false,
    chainId: 5042002,
    chainKey: "arc-testnet",
  },
  {
    symbol: "SYN",
    name: "Synthra Token",
    decimals: TOKEN_DECIMALS.SYN ?? 18,
    address: TOKEN_CONTRACTS.SYN,
    isNativeGas: false,
    chainId: 5042002,
    chainKey: "arc-testnet",
  },
];

export async function getTokensResponse() {
  return NextResponse.json({
    success: true,
    data: SUPPORTED_TOKENS,
  });
}

export const GET = withFrontendOriginGate(async (_request: NextRequest) =>
  getTokensResponse(),
);
