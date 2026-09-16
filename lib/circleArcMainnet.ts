import { createTokenRegistry } from "@circle-fin/bridge-kit";
import { ArcTestnet, Ethereum } from "@circle-fin/bridge-kit/chains";
import type { Chain as ViemChain } from "viem";

import {
  ARC_MAINNET_EXPLORER_URL,
  ARC_MAINNET_RPC_URLS,
} from "@/lib/arcNetwork";
import {
  ARC_NATIVE_USDC_ADDRESS,
  BRIDGE_EURC_ADDRESSES,
} from "@/lib/bridgeNetworks";

// Circle Bridge Kit / AppKit only enumerate Arc as `Arc_Testnet`. Zod's
// Blockchain enum rejects `Arc` with INPUT_INVALID_CHAIN ("Invalid input").
// Keep that identifier so kit.bridge() validates, then override runtime
// fields for Arc mainnet (chain ID 5042, domain 26).
export const CIRCLE_ARC_MAINNET_CHAIN = ArcTestnet.chain;

// Circle CCTP mainnet CREATE2 addresses (domain 26).
// https://developers.circle.com/cctp/references/contract-addresses
const ARC_MAINNET_TOKEN_MESSENGER_V2 =
  "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const ARC_MAINNET_MESSAGE_TRANSMITTER_V2 =
  "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";

export const ArcMainnet = {
  ...ArcTestnet,
  chain: CIRCLE_ARC_MAINNET_CHAIN,
  name: "Arc",
  title: "Arc",
  chainId: 5042,
  isTestnet: false,
  explorerUrl: `${ARC_MAINNET_EXPLORER_URL}/tx/{hash}`,
  rpcEndpoints: [...ARC_MAINNET_RPC_URLS],
  eurcAddress: BRIDGE_EURC_ADDRESSES.arc,
  usdcAddress: ARC_NATIVE_USDC_ADDRESS,
  kitContracts: Ethereum.kitContracts,
  cctp: {
    domain: 26,
    contracts: {
      v2: {
        type: "split",
        tokenMessenger: ARC_MAINNET_TOKEN_MESSENGER_V2,
        messageTransmitter: ARC_MAINNET_MESSAGE_TRANSMITTER_V2,
        confirmations: 1,
        fastConfirmations: 1,
      },
    },
    forwarderSupported: {
      source: false,
      destination: true,
    },
  },
  gateway: Ethereum.gateway
    ? {
        ...Ethereum.gateway,
        domain: 26,
      }
    : undefined,
} as unknown as typeof ArcTestnet;

// Official Arc mainnet wallet params:
// https://docs.arc.io/arc/references/connect-to-arc#mainnet-2
export const ARC_MAINNET_VIEM_CHAIN = {
  id: 5042,
  name: "Arc",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [...ARC_MAINNET_RPC_URLS] },
    public: { http: [...ARC_MAINNET_RPC_URLS] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: ARC_MAINNET_EXPLORER_URL },
  },
} as ViemChain;

const isArcMainnetCircleChain = (chain: {
  chainId?: number;
  id?: number;
  isTestnet?: boolean;
} | null) =>
  chain?.chainId === 5042 ||
  (chain?.id === 5042 && chain?.isTestnet === false);

/**
 * Circle's Viem adapter maps `chain.chain` through getViemChainByEnum().
 * Arc mainnet must reuse the `Arc_Testnet` identifier for Zod, so that lookup
 * always returns chain 5042002. Override the adapter to keep wallet txs on 5042.
 */
export function withCircleChainAwareViemAdapter<T>(adapter: T): T {
  const candidate = adapter as T & {
    options?: {
      getPublicClient?: (params: { chain: ViemChain }) => unknown;
      getWalletClient?: (params: { chain: ViemChain }) => Promise<unknown> | unknown;
    };
    cachedPublicClients?: Map<number, unknown>;
    cachedWalletClients?: Map<number, unknown>;
    walletClientInitPromises?: Map<number, Promise<unknown>>;
    getViemChain?: (chain: unknown) => Promise<ViemChain>;
    getPublicClient?: (chain: unknown) => Promise<unknown>;
    initializeWalletClient?: (chain: unknown) => Promise<unknown>;
    __towerArcMainnetViemPatch?: boolean;
  };

  if (!candidate || candidate.__towerArcMainnetViemPatch) {
    return adapter;
  }

  candidate.cachedPublicClients?.delete(5042);
  candidate.cachedWalletClients?.delete(5042);
  candidate.walletClientInitPromises?.delete(5042);

  const originalGetViemChain = candidate.getViemChain?.bind(candidate);
  const originalGetPublicClient = candidate.getPublicClient?.bind(candidate);
  const originalInitializeWalletClient =
    candidate.initializeWalletClient?.bind(candidate);

  candidate.getViemChain = async (chain) => {
    if (isArcMainnetCircleChain(chain as { chainId?: number; id?: number })) {
      return ARC_MAINNET_VIEM_CHAIN;
    }
    if (!originalGetViemChain) {
      throw new Error("Bridge adapter is missing getViemChain");
    }
    return originalGetViemChain(chain);
  };

  if (originalGetPublicClient && candidate.options?.getPublicClient) {
    candidate.getPublicClient = async (chainDef) => {
      if (!isArcMainnetCircleChain(chainDef as { chainId?: number })) {
        return originalGetPublicClient(chainDef);
      }

      const cached = candidate.cachedPublicClients?.get(5042);
      if (cached) {
        return cached;
      }

      const publicClient = await candidate.options!.getPublicClient!({
        chain: ARC_MAINNET_VIEM_CHAIN,
      });
      candidate.cachedPublicClients?.set(5042, publicClient);
      return publicClient;
    };
  }

  if (originalInitializeWalletClient && candidate.options?.getWalletClient) {
    candidate.initializeWalletClient = async (chain) => {
      if (!isArcMainnetCircleChain(chain as { chainId?: number })) {
        return originalInitializeWalletClient(chain);
      }

      const cached = candidate.cachedWalletClients?.get(5042);
      if (cached) {
        return cached;
      }

      const ongoing = candidate.walletClientInitPromises?.get(5042);
      if (ongoing) {
        return ongoing;
      }

      const initPromise = (async () => {
        try {
          const walletClient = await candidate.options!.getWalletClient!({
            chain: ARC_MAINNET_VIEM_CHAIN,
          });
          candidate.cachedWalletClients?.set(5042, walletClient);
          candidate.walletClientInitPromises?.delete(5042);
          return walletClient;
        } catch (error) {
          candidate.walletClientInitPromises?.delete(5042);
          throw error;
        }
      })();

      candidate.walletClientInitPromises?.set(5042, initPromise);
      return initPromise;
    };
  }

  candidate.__towerArcMainnetViemPatch = true;
  return adapter;
}

export function createCircleBridgeTokenRegistry(options?: {
  arcMainnet?: boolean;
}) {
  const defaults = createTokenRegistry();
  const usdc = defaults.get("USDC");
  const eurc = defaults.get("EURC");

  if (!usdc || !eurc || !options?.arcMainnet) {
    return defaults;
  }

  return createTokenRegistry({
    tokens: [
      {
        ...usdc,
        locators: {
          ...usdc.locators,
          [CIRCLE_ARC_MAINNET_CHAIN]: ARC_NATIVE_USDC_ADDRESS,
        },
      },
      {
        ...eurc,
        locators: {
          ...eurc.locators,
          [CIRCLE_ARC_MAINNET_CHAIN]: BRIDGE_EURC_ADDRESSES.arc,
        },
      },
    ],
  });
}

const tokenRegistryCache = new Map<
  string,
  ReturnType<typeof createCircleBridgeTokenRegistry>
>();

export function getCircleBridgeTokenRegistry(options?: {
  arcMainnet?: boolean;
}) {
  const cacheKey = options?.arcMainnet ? "arc-mainnet" : "default";
  const cached = tokenRegistryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const registry = createCircleBridgeTokenRegistry(options);
  tokenRegistryCache.set(cacheKey, registry);
  return registry;
}
