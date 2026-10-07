import {
  createPublicClient,
  fallback,
  http,
  isHash,
  type Chain,
  type Hex,
  type PublicClient,
} from "viem";
import {
  arbitrum,
  arbitrumSepolia,
  avalanche,
  avalancheFuji,
  base,
  baseSepolia,
  linea,
  lineaSepolia,
  mainnet,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  sepolia,
  sonic,
  sonicTestnet,
  unichain,
  unichainSepolia,
} from "viem/chains";
import {
  ARC_MAINNET_CONFIG,
  ARC_TESTNET_CONFIG,
} from "@/lib/arcNetwork";
import { getArcMainnetRpcUrls, getArcRpcUrls } from "@/lib/arcRpc";

/**
 * Server-side proof that a logged activity really happened on-chain.
 *
 * activities rows are written by the client, so a row alone proves nothing.
 * A transaction counts only if its receipt succeeded and it was sent by the
 * wallet that claims it. Solana (non-EVM) activity cannot be checked here and is
 * reported as "unsupported".
 */

export type NetworkMode = "mainnet" | "testnet";

export type TxCheck =
  | { outcome: "verified"; chainId: number; blockTime: string }
  | { outcome: "rejected"; reason: string }
  | { outcome: "unavailable"; reason: string }
  | { outcome: "unsupported"; reason: string };

const arcMainnet: Chain = {
  id: ARC_MAINNET_CONFIG.chainId,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: getArcMainnetRpcUrls() } },
};

const arcTestnet: Chain = {
  id: ARC_TESTNET_CONFIG.chainId,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: getArcRpcUrls() } },
};

/** Tower/bridge chain ids (see lib/bridgeNetworks.ts) -> EVM chain. */
const MAINNET_CHAINS: Record<string, Chain> = {
  arc: arcMainnet,
  base,
  optimism,
  avalanche,
  arbitrum,
  ethereum: mainnet,
  linea,
  polygon,
  sonic,
  unichain,
};

const TESTNET_CHAINS: Record<string, Chain> = {
  "arc-testnet": arcTestnet,
  "base-sepolia": baseSepolia,
  "optimism-sepolia": optimismSepolia,
  "avalanche-fuji": avalancheFuji,
  "arbitrum-sepolia": arbitrumSepolia,
  "ethereum-sepolia": sepolia,
  "linea-sepolia": lineaSepolia,
  "polygon-amoy": polygonAmoy,
  "sonic-testnet": sonicTestnet,
  "unichain-sepolia": unichainSepolia,
};

const TESTNET_HINT = /test|sepolia|fuji|amoy|devnet|holesky/i;

/** "avalanche-mainnet" -> mainnet, "arc-testnet" -> testnet. */
export function modeFromNetwork(network: string | null | undefined): NetworkMode {
  return network && TESTNET_HINT.test(network) ? "testnet" : "mainnet";
}

/**
 * Map the network name stored on an activity to an EVM chain for a campaign
 * mode. Swaps log the bare name "Arc" (no mainnet/testnet marker), so it
 * resolves to Arc of the campaign's mode. Activity on the other mode's chains
 * never counts.
 */
export function resolveChain(
  networkName: string | null | undefined,
  mode: NetworkMode,
): Chain | null {
  const name = (networkName ?? "").trim().toLowerCase();
  if (!name) return null;
  if (name === "arc") return mode === "mainnet" ? arcMainnet : arcTestnet;
  return (mode === "mainnet" ? MAINNET_CHAINS : TESTNET_CHAINS)[name] ?? null;
}

const clients = new Map<number, PublicClient>();

function getClient(chain: Chain): PublicClient {
  const cached = clients.get(chain.id);
  if (cached) return cached;

  const override = process.env[`LEGION_RPC_URL_${chain.id}`]?.trim();
  const urls = override ? [override] : [...chain.rpcUrls.default.http];
  const client = createPublicClient({
    chain,
    transport:
      urls.length > 1
        ? fallback(urls.map((url) => http(url, { timeout: 4_000, retryCount: 0 })))
        : http(urls[0], { timeout: 4_000, retryCount: 0 }),
  }) as PublicClient;
  clients.set(chain.id, client);
  return client;
}

/** Contracts a swap must be sent to (comma-separated). Empty => not enforced. */
function trustedContracts(): Set<string> {
  return new Set(
    (process.env.LEGION_TRUSTED_CONTRACTS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function normalizeTxHash(value: unknown): Hex | null {
  if (typeof value !== "string") return null;
  const hash = value.trim().toLowerCase();
  return isHash(hash) ? (hash as Hex) : null;
}

/**
 * @param enforceTarget  require tx.to to be in LEGION_TRUSTED_CONTRACTS (swaps)
 * @param ageMs          age of the activity row; a hash still missing on-chain
 *                       after a grace period is treated as fabricated
 */
export async function verifyActivityTransaction(params: {
  hash: string;
  wallet: string;
  networkName: string | null | undefined;
  mode: NetworkMode;
  enforceTarget: boolean;
  ageMs: number;
}): Promise<TxCheck> {
  const hash = normalizeTxHash(params.hash);
  if (!hash) return { outcome: "rejected", reason: "malformed transaction hash" };

  const chain = resolveChain(params.networkName, params.mode);
  if (!chain) {
    return {
      outcome: "unsupported",
      reason: `network '${params.networkName ?? ""}' is not verifiable for ${params.mode}`,
    };
  }

  const client = getClient(chain);

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash });
  } catch (error) {
    const notFound =
      error instanceof Error && error.name === "TransactionReceiptNotFoundError";
    if (notFound) {
      // Not indexed yet is normal for a fresh tx; an old row with no tx is fake.
      return params.ageMs > 15 * 60_000
        ? { outcome: "rejected", reason: "transaction not found on-chain" }
        : { outcome: "unavailable", reason: "transaction not indexed yet" };
    }
    return {
      outcome: "unavailable",
      reason: error instanceof Error ? error.message : "RPC error",
    };
  }

  if (receipt.status !== "success") {
    return { outcome: "rejected", reason: "transaction reverted" };
  }

  let transaction;
  try {
    transaction = await client.getTransaction({ hash });
  } catch (error) {
    return {
      outcome: "unavailable",
      reason: error instanceof Error ? error.message : "RPC error",
    };
  }

  if (transaction.from.toLowerCase() !== params.wallet.toLowerCase()) {
    return { outcome: "rejected", reason: "transaction was sent by another wallet" };
  }

  if (params.enforceTarget) {
    const allowed = trustedContracts();
    if (allowed.size > 0 && !(transaction.to && allowed.has(transaction.to.toLowerCase()))) {
      return { outcome: "rejected", reason: "transaction target is not a Tower contract" };
    }
  }

  let blockTime = new Date().toISOString();
  try {
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    blockTime = new Date(Number(block.timestamp) * 1000).toISOString();
  } catch {
    // Block lookup is only for a precise occurredAt; the tx itself is proven.
  }

  return { outcome: "verified", chainId: chain.id, blockTime };
}
