import { DZapClient } from "@dzapio/sdk";

import { ARC_NETWORK_CHAIN_ID } from "@/lib/arcNetwork";
import { getArcMainnetRpcUrls, getArcRpcUrls } from "@/lib/arcRpc";

export const DZAP_ARC_MAINNET_CHAIN_ID = ARC_NETWORK_CHAIN_ID.mainnet;
export const DZAP_ARC_TESTNET_CHAIN_ID = ARC_NETWORK_CHAIN_ID.testnet;

export const DZAP_ARC_ROUTER_ADDRESS =
  "0xb3926deF2e0989B0700a57034C9A211bfBcF858B" as const;

let dzapClient: DZapClient | null = null;

export function isDzapEnabled() {
  return (
    process.env.DZAP_ENABLED !== "false" &&
    process.env.NEXT_PUBLIC_DZAP_ENABLED !== "false"
  );
}

export function isDzapSupportedChain(chainId: number) {
  return (
    chainId === DZAP_ARC_MAINNET_CHAIN_ID ||
    chainId === DZAP_ARC_TESTNET_CHAIN_ID
  );
}

const getRpcUrlsByChainId = (): Record<number, string[]> => ({
  [DZAP_ARC_MAINNET_CHAIN_ID]: getArcMainnetRpcUrls(),
  [DZAP_ARC_TESTNET_CHAIN_ID]: getArcRpcUrls(),
});

export function getDzapClient() {
  if (!dzapClient) {
    const apiKey = process.env.DZAP_API_KEY?.trim() || undefined;
    dzapClient = DZapClient.getInstance(apiKey, getRpcUrlsByChainId());
  }

  return dzapClient;
}
