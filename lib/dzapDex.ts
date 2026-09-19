import {
  QuoteFilters,
  Services,
  type EvmTxData,
  type HexString,
  type TradeBuildTxnResponse,
  type TradeQuotesResponse,
} from "@dzapio/sdk";
import {
  createPublicClient,
  encodeFunctionData,
  fallback,
  getAddress,
  http,
  isAddress,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";

import { getArcMainnetRpcUrls, getArcRpcUrls } from "@/lib/arcRpc";
import { getTokenDecimalsByAddress } from "@/lib/swapApiContract";
import { TOWER_DEX_ID, TOWER_DEX_NAME } from "@/lib/towerDex";
import {
  DZAP_ARC_MAINNET_CHAIN_ID,
  DZAP_ARC_ROUTER_ADDRESS,
  DZAP_ARC_TESTNET_CHAIN_ID,
  getDzapClient,
  isDzapEnabled,
  isDzapSupportedChain,
} from "@/lib/dzapClient";
export {
  DZAP_ARC_MAINNET_CHAIN_ID,
  DZAP_ARC_ROUTER_ADDRESS,
  DZAP_ARC_TESTNET_CHAIN_ID,
  isDzapEnabled,
  isDzapSupportedChain,
} from "@/lib/dzapClient";

export const DZAP_QUOTE_SOURCE = "dzap" as const;
export const DZAP_DEX_ID = TOWER_DEX_ID;
export const DZAP_DEX_NAME = TOWER_DEX_NAME;

const TOWER_SWAP_FEE_MODE = "tower-swap-executor" as const;
const DEFAULT_GAS_LIMIT = 800000n;
const EXECUTOR_GAS_LIMIT = 1_600_000n;
const DEFAULT_APPROVAL_GAS_LIMIT = 100000n;
const NORMALIZED_DECIMALS = 18;
const BPS_DENOMINATOR = 10_000n;
const DEFAULT_TOWER_SWAP_FEE_BPS = 30;
const EXECUTOR_FEE_STATE_TTL_MS = 30_000;
const DZAP_QUOTE_TIMEOUT_MS = 8_000;
const DZAP_BUILD_TIMEOUT_MS = 20_000;
const DZAP_QUOTE_CACHE_SOFT_TTL_MS = 12_000;
const DZAP_QUOTE_CACHE_HARD_TTL_MS = 120_000;

const DZAP_SWAP_EXECUTOR_MAINNET_DEFAULT =
  "0xeB8940752Fa12944d3b2D736d51fA36E4dA32BC8" as Address;
const DZAP_SWAP_EXECUTOR_TESTNET_DEFAULT =
  "0x2De8906a641d65d490bC60A4179d961d59742bCb" as Address;
const DZAP_SWAP_FEE_RECIPIENT_DEFAULT =
  "0xb3966683724303400B6fECDa1963825d994B546a" as Address;
const DZAP_PERMIT2_ADDRESS =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;

const ERC20_ALLOWANCE_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const TOWER_SWAP_EXECUTOR_ABI = [
  {
    type: "function",
    name: "executeSwap",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "minAmountOut", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "routeTarget", type: "address" },
          { name: "approvalSpender", type: "address" },
          { name: "routeCalldata", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "feeAmount", type: "uint256" },
      { name: "inputRefund", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "routeTargets",
    stateMutability: "view",
    inputs: [{ name: "target", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "approvalSpenders",
    stateMutability: "view",
    inputs: [{ name: "spender", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "platformFeeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const DZAP_ADAPTER_ABI = [
  {
    type: "function",
    name: "swapExactInput",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "minAmountOut", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "routeTarget", type: "address" },
      { name: "routeCalldata", type: "bytes" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

const NATIVE_TOKEN_SENTINELS = new Set([
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "0x0000000000000000000000000000000000000000",
]);

export type DzapQuoteMeta = {
  source: typeof DZAP_QUOTE_SOURCE;
  fromChain: number;
  toChain: number;
  protocol: string;
  bestReturnSource?: string;
  additionalInfo?: Record<string, unknown>;
  srcDecimals: number;
  destDecimals: number;
  slippagePercent: number;
  amount: string;
  srcToken: string;
  destToken: string;
  providerName?: string;
};

export type DzapQuote = {
  inputToken: string;
  outputToken: string;
  inputAmount: string;
  swapInputAmount?: string;
  outputAmount: string;
  minOut: string;
  inputAmountNative: string;
  swapInputAmountNative?: string;
  outputAmountNative: string;
  minOutNative: string;
  priceImpact: number;
  gasEstimate: string;
  slippage: number;
  feeMode: "none" | typeof TOWER_SWAP_FEE_MODE;
  feeBps?: number;
  feeRecipient?: string;
  platformFeeAmount?: string;
  platformFeeAmountNative?: string;
  dzap: DzapQuoteMeta;
  route: {
    type: "single" | "multi";
    rawPath?: string;
    hops: Array<{
      dexId: typeof TOWER_DEX_ID;
      dex?: typeof TOWER_DEX_ID;
      dexName: typeof TOWER_DEX_NAME;
      dexRouter: string;
      path: string[];
      amountIn: string;
      amountOut: string;
      priceImpact: number;
    }>;
  };
};

export type DzapSwapTransaction = {
  to: string;
  data: Hex;
  value: string;
  from: string;
  gasLimit: string;
  chainId: number;
  expectedUserOutput?: string;
  feeMode: "none" | typeof TOWER_SWAP_FEE_MODE;
  feeBps?: number;
  feeRecipient?: string;
  feeToken?: string;
  platformFeeAmount?: string;
  executorAddress?: string;
  inputToken?: string;
  outputToken?: string;
  inputAmountNative?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asHexAddress = (value: string): HexString => getAddress(value) as HexString;

const toHexQuantity = (value: bigint | number | string) => {
  if (typeof value === "string" && value.startsWith("0x")) {
    return `0x${BigInt(value).toString(16)}`;
  }

  return `0x${BigInt(value).toString(16)}`;
};

const scaleAmount = (amount: bigint, fromDecimals: number, toDecimals: number) => {
  if (fromDecimals === toDecimals) {
    return amount;
  }

  return fromDecimals < toDecimals
    ? amount * 10n ** BigInt(toDecimals - fromDecimals)
    : amount / 10n ** BigInt(fromDecimals - toDecimals);
};

const slippageBpsToPercent = (slippageBps: number) => slippageBps / 100;

const parsePriceImpactBps = (value: string | number | undefined) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value || "0");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.round(parsed * 100);
};

const isNativeSentinelToken = (address: string) =>
  NATIVE_TOKEN_SENTINELS.has(address.toLowerCase());

const readErrorMessage = (error: unknown) => {
  if (isRecord(error)) {
    const response = isRecord(error.response) ? error.response : null;
    const data = response && isRecord(response.data) ? response.data : null;
    const nested =
      (data && (asString(data.error) || asString(data.message))) ||
      asString(error.errorMsg) ||
      asString(error.message);
    if (nested) {
      return nested;
    }
  }

  return error instanceof Error ? error.message : "DZap request failed";
};

const asString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const isDzapRateLimitMessage = (message: string) =>
  /rate\s*limit/i.test(message);

type DzapQuoteCacheEntry = {
  quote: DzapQuote;
  fetchedAt: number;
};

const dzapQuoteCache = new Map<string, DzapQuoteCacheEntry>();

const getDzapQuoteCacheKey = (params: {
  chainId: number;
  srcToken: string;
  destToken: string;
  amount: string;
  slippageBps: number;
}) =>
  `${params.chainId}:${params.srcToken.toLowerCase()}:${params.destToken.toLowerCase()}:${params.amount}:${params.slippageBps}`;

const readCachedDzapQuote = (cacheKey: string, maxAgeMs: number) => {
  const cached = dzapQuoteCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.fetchedAt > maxAgeMs) {
    return null;
  }

  return cached.quote;
};

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const createDzapPublicClient = (chainId: number) => {
  const urls =
    chainId === DZAP_ARC_MAINNET_CHAIN_ID
      ? getArcMainnetRpcUrls()
      : getArcRpcUrls();
  const [primary, ...rest] = urls;

  return createPublicClient({
    chain: {
      id: chainId,
      name: chainId === DZAP_ARC_MAINNET_CHAIN_ID ? "Arc" : "Arc Testnet",
      nativeCurrency: {
        decimals: 18,
        name: "USD Coin",
        symbol: "USDC",
      },
      rpcUrls: {
        default: { http: urls },
      },
    },
    transport:
      rest.length > 0
        ? fallback(
            urls.map((url) =>
              http(url, {
                retryCount: 1,
                timeout: 12_000,
              }),
            ),
          )
        : http(primary, {
            retryCount: 1,
            timeout: 12_000,
          }),
  });
};

const resolveOptionalAddress = (value?: string | null) =>
  value && isAddress(value) ? getAddress(value) : null;

const parseTowerSwapFeeBps = (value?: string | null) => {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= Number(BPS_DENOMINATOR)
    ? parsed
    : DEFAULT_TOWER_SWAP_FEE_BPS;
};

const DZAP_SWAP_FEE_BPS = parseTowerSwapFeeBps(
  process.env.NEXT_PUBLIC_TOWER_SWAP_FEE_BPS ||
    process.env.TOWER_SWAP_FEE_BPS ||
    process.env.NEXT_PUBLIC_SWAP_FEE_BPS ||
    process.env.SWAP_FEE_BPS,
);

const DZAP_SWAP_FEE_RECIPIENT =
  resolveOptionalAddress(
    process.env.NEXT_PUBLIC_TOWER_SWAP_FEE_RECIPIENT ||
      process.env.TOWER_SWAP_FEE_RECIPIENT ||
      process.env.NEXT_PUBLIC_TOWER_SWAP_EXECUTOR_TREASURY ||
      process.env.TOWER_SWAP_EXECUTOR_TREASURY,
  ) || getAddress(DZAP_SWAP_FEE_RECIPIENT_DEFAULT);

export function getDzapExecutorAddress(chainId: number): Address | null {
  if (chainId === DZAP_ARC_MAINNET_CHAIN_ID) {
    return (
      resolveOptionalAddress(
        process.env.NEXT_PUBLIC_TOWER_SWAP_EXECUTOR_MAINNET_ADDRESS ||
          process.env.TOWER_SWAP_EXECUTOR_MAINNET_ADDRESS,
      ) || getAddress(DZAP_SWAP_EXECUTOR_MAINNET_DEFAULT)
    );
  }

  if (chainId === DZAP_ARC_TESTNET_CHAIN_ID) {
    return (
      resolveOptionalAddress(
        process.env.NEXT_PUBLIC_TOWER_SWAP_EXECUTOR_ADDRESS ||
          process.env.TOWER_SWAP_EXECUTOR_ADDRESS,
      ) || getAddress(DZAP_SWAP_EXECUTOR_TESTNET_DEFAULT)
    );
  }

  return null;
}

export function getDzapAdapterAddress(chainId: number): Address | null {
  if (chainId === DZAP_ARC_MAINNET_CHAIN_ID) {
    return resolveOptionalAddress(
      process.env.NEXT_PUBLIC_DZAP_ADAPTER_MAINNET_ADDRESS ||
        process.env.DZAP_ADAPTER_MAINNET_ADDRESS,
    );
  }

  if (chainId === DZAP_ARC_TESTNET_CHAIN_ID) {
    return resolveOptionalAddress(
      process.env.NEXT_PUBLIC_DZAP_ADAPTER_ADDRESS ||
        process.env.DZAP_ADAPTER_ADDRESS,
    );
  }

  return null;
}

type DzapExecutorFeeState = {
  enabled: boolean;
  feeBps: number;
  treasury: Address | null;
};

const executorFeeStateCache = new Map<
  string,
  { state: DzapExecutorFeeState; expiresAt: number }
>();

async function getDzapExecutorFeeState(
  chainId: number,
  executorAddress: Address,
): Promise<DzapExecutorFeeState> {
  const cacheKey = `${chainId}:${executorAddress.toLowerCase()}`;
  const cached = executorFeeStateCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.state;
  }

  const disabledState: DzapExecutorFeeState = {
    enabled: false,
    feeBps: DZAP_SWAP_FEE_BPS,
    treasury: DZAP_SWAP_FEE_RECIPIENT,
  };

  try {
    const client = createDzapPublicClient(chainId);
    const [onChainFeeBps, treasury] = await Promise.all([
      client.readContract({
        address: executorAddress,
        abi: TOWER_SWAP_EXECUTOR_ABI,
        functionName: "platformFeeBps",
      }),
      client.readContract({
        address: executorAddress,
        abi: TOWER_SWAP_EXECUTOR_ABI,
        functionName: "treasury",
      }),
    ]);

    const feeBps = Number(onChainFeeBps) > 0 ? Number(onChainFeeBps) : DZAP_SWAP_FEE_BPS;
    const resolvedTreasury =
      treasury && isAddress(treasury) && treasury.toLowerCase() !== zeroAddress
        ? getAddress(treasury)
        : DZAP_SWAP_FEE_RECIPIENT;
    const state: DzapExecutorFeeState = {
      enabled: Boolean(feeBps > 0 && resolvedTreasury),
      feeBps,
      treasury: resolvedTreasury,
    };
    executorFeeStateCache.set(cacheKey, {
      state,
      expiresAt: Date.now() + EXECUTOR_FEE_STATE_TTL_MS,
    });
    return state;
  } catch (error) {
    console.warn("[DZap] executor fee state unavailable:", error);
    executorFeeStateCache.set(cacheKey, {
      state: disabledState,
      expiresAt: Date.now() + EXECUTOR_FEE_STATE_TTL_MS,
    });
    return disabledState;
  }
}

const pickTradeQuote = (quotes: TradeQuotesResponse) => {
  const pairKey = Object.keys(quotes)[0];
  if (!pairKey) {
    return null;
  }

  const pair = quotes[pairKey];
  if (!pair) {
    return null;
  }

  const protocol = pair.recommendedSource || pair.bestReturnSource;
  if (!protocol) {
    return null;
  }

  const quote = pair.quoteRates?.[protocol];
  if (!quote || BigInt(quote.destAmount || "0") <= 0n) {
    return null;
  }

  return {
    pairKey,
    protocol,
    bestReturnSource: pair.bestReturnSource,
    quote,
  };
};

const getRouterAddress = async (
  client: ReturnType<typeof getDzapClient>,
  chainId: number,
) => {
  try {
    const address = await client.getDZapContractAddress({
      chainId,
      service: Services.trade,
    });
    if (address && isAddress(address)) {
      return getAddress(address);
    }
  } catch (error) {
    console.warn("[DZap] router lookup failed, using Arc default:", readErrorMessage(error));
  }

  return getAddress(DZAP_ARC_ROUTER_ADDRESS);
};

const toEvmTransaction = (built: TradeBuildTxnResponse): EvmTxData | null => {
  if (built.gasless) {
    return null;
  }

  const transaction = built.transaction;
  if (
    transaction &&
    typeof transaction === "object" &&
    "to" in transaction &&
    "data" in transaction &&
    typeof transaction.to === "string" &&
    typeof transaction.data === "string"
  ) {
    return transaction as EvmTxData;
  }

  if (built.to && built.data) {
    return {
      from: (built.from || "0x") as HexString,
      to: built.to as HexString,
      data: built.data as HexString,
      value: built.value || "0",
      gasLimit: built.gasLimit || DEFAULT_GAS_LIMIT.toString(),
    };
  }

  return null;
};

export function isDzapQuote(quote: unknown): quote is DzapQuote {
  if (!isRecord(quote) || !isRecord(quote.dzap)) {
    return false;
  }

  return (
    quote.dzap.source === DZAP_QUOTE_SOURCE &&
    typeof quote.dzap.protocol === "string" &&
    quote.dzap.protocol.length > 0
  );
}

export async function getDzapQuote(params: {
  inputToken: string;
  outputToken: string;
  inputAmount: string;
  slippageBps: number;
  chainId: number;
  account?: string;
}): Promise<DzapQuote | null> {
  if (!isDzapEnabled() || !isDzapSupportedChain(params.chainId)) {
    return null;
  }

  if (!isAddress(params.inputToken) || !isAddress(params.outputToken)) {
    return null;
  }

  let amountIn: bigint;
  try {
    amountIn = BigInt(params.inputAmount);
  } catch {
    return null;
  }

  if (amountIn <= 0n) {
    return null;
  }

  const srcToken = getAddress(params.inputToken);
  const destToken = getAddress(params.outputToken);
  const srcDecimals = getTokenDecimalsByAddress(srcToken);
  const destDecimals = getTokenDecimalsByAddress(destToken);
  const slippagePercent = slippageBpsToPercent(params.slippageBps);
  const adapterAddress = getDzapAdapterAddress(params.chainId);
  const executorAddress = getDzapExecutorAddress(params.chainId);
  const canCollectExecutorFee =
    Boolean(adapterAddress && executorAddress) &&
    !isNativeSentinelToken(srcToken) &&
    !isNativeSentinelToken(destToken);
  const feeState = canCollectExecutorFee
    ? await getDzapExecutorFeeState(params.chainId, executorAddress as Address)
    : {
        enabled: false,
        feeBps: DZAP_SWAP_FEE_BPS,
        treasury: DZAP_SWAP_FEE_RECIPIENT,
      };
  const shouldCollectExecutorFee = canCollectExecutorFee && feeState.enabled;
  const platformFeeAmountNative = shouldCollectExecutorFee
    ? (amountIn * BigInt(feeState.feeBps)) / BPS_DENOMINATOR
    : 0n;
  const swapInputAmountNative = amountIn - platformFeeAmountNative;

  if (swapInputAmountNative <= 0n) {
    return null;
  }

  const cacheKey = getDzapQuoteCacheKey({
    chainId: params.chainId,
    srcToken,
    destToken,
    amount: amountIn.toString(),
    slippageBps: params.slippageBps,
  });
  const freshCachedQuote = readCachedDzapQuote(
    cacheKey,
    DZAP_QUOTE_CACHE_SOFT_TTL_MS,
  );
  if (freshCachedQuote) {
    return freshCachedQuote;
  }

  try {
    const client = getDzapClient();
    const quotes = await withTimeout(
      client.getTradeQuotes({
        fromChain: params.chainId,
        account: params.account || adapterAddress || undefined,
        filter: QuoteFilters.best,
        disableEstimation: true,
        timingStrategy: {
          minWaitTimeMs: 400,
          maxWaitTimeMs: 3_500,
          preferredResultCount: 1,
          relaxMinSuccessOnDelay: true,
        },
        data: [
          {
            amount: swapInputAmountNative.toString(),
            srcToken,
            srcDecimals,
            destToken,
            destDecimals,
            toChain: params.chainId,
            slippage: slippagePercent,
          },
        ],
      }),
      DZAP_QUOTE_TIMEOUT_MS,
      `DZap quote timed out after ${DZAP_QUOTE_TIMEOUT_MS}ms`,
    );

    const selected = pickTradeQuote(quotes);
    if (!selected) {
      return null;
    }

    const quote = selected.quote;
    const amountOut = BigInt(quote.destAmount);
    const minOut = BigInt(quote.minDestAmount || "0");
    const priceImpact = parsePriceImpactBps(quote.priceImpactPercent);
    const routerAddress = await getRouterAddress(client, params.chainId);
    const pathSteps = quote.path ?? [];
    const hops =
      pathSteps.length > 0
        ? pathSteps.map((step: any) => ({
            dexId: TOWER_DEX_ID,
            dex: TOWER_DEX_ID,
            dexName: TOWER_DEX_NAME,
            dexRouter: routerAddress,
            path: [step.srcToken.address, step.destToken.address],
            amountIn: step.srcAmount,
            amountOut: step.destAmount,
            priceImpact,
          }))
        : [
            {
              dexId: TOWER_DEX_ID,
              dex: TOWER_DEX_ID,
              dexName: TOWER_DEX_NAME,
              dexRouter: routerAddress,
              path: [srcToken, destToken],
              amountIn: swapInputAmountNative.toString(),
              amountOut: quote.destAmount,
              priceImpact,
            },
          ];

    const mappedQuote: DzapQuote = {
      inputToken: srcToken,
      outputToken: destToken,
      inputAmount: scaleAmount(amountIn, srcDecimals, NORMALIZED_DECIMALS).toString(),
      swapInputAmount: scaleAmount(
        swapInputAmountNative,
        srcDecimals,
        NORMALIZED_DECIMALS,
      ).toString(),
      outputAmount: scaleAmount(amountOut, destDecimals, NORMALIZED_DECIMALS).toString(),
      minOut: scaleAmount(minOut, destDecimals, NORMALIZED_DECIMALS).toString(),
      inputAmountNative: amountIn.toString(),
      swapInputAmountNative: swapInputAmountNative.toString(),
      outputAmountNative: amountOut.toString(),
      minOutNative: minOut.toString(),
      priceImpact,
      gasEstimate: shouldCollectExecutorFee
        ? EXECUTOR_GAS_LIMIT.toString()
        : DEFAULT_GAS_LIMIT.toString(),
      slippage: params.slippageBps,
      feeMode: shouldCollectExecutorFee ? TOWER_SWAP_FEE_MODE : "none",
      feeBps: shouldCollectExecutorFee ? feeState.feeBps : undefined,
      feeRecipient: shouldCollectExecutorFee
        ? feeState.treasury || undefined
        : undefined,
      platformFeeAmount:
        platformFeeAmountNative > 0n
          ? scaleAmount(platformFeeAmountNative, srcDecimals, NORMALIZED_DECIMALS).toString()
          : undefined,
      platformFeeAmountNative:
        platformFeeAmountNative > 0n ? platformFeeAmountNative.toString() : undefined,
      dzap: {
        source: DZAP_QUOTE_SOURCE,
        fromChain: params.chainId,
        toChain: params.chainId,
        protocol: selected.protocol,
        bestReturnSource: selected.bestReturnSource,
        additionalInfo: quote.additionalInfo as Record<string, unknown> | undefined,
        srcDecimals,
        destDecimals,
        slippagePercent,
        amount: swapInputAmountNative.toString(),
        srcToken,
        destToken,
        providerName: quote.providerDetails?.name,
      },
      route: {
        type: hops.length > 1 ? "multi" : "single",
        rawPath: quote.providerDetails?.name || selected.protocol,
        hops,
      },
    };

    dzapQuoteCache.set(cacheKey, {
      quote: mappedQuote,
      fetchedAt: Date.now(),
    });
    return mappedQuote;
  } catch (error) {
    const message = readErrorMessage(error);
    const staleCachedQuote = readCachedDzapQuote(
      cacheKey,
      DZAP_QUOTE_CACHE_HARD_TTL_MS,
    );
    if (staleCachedQuote && isDzapRateLimitMessage(message)) {
      console.warn("[DZap] rate limited, reusing cached Tower quote");
      return staleCachedQuote;
    }

    console.warn("[DZap] quote unavailable:", message);
    return null;
  }
}

export async function buildDzapSwapTransaction(params: {
  quote: DzapQuote;
  userAddress: string;
}) {
  if (!isAddress(params.userAddress)) {
    throw new Error("Missing userAddress for DZap swap");
  }

  const meta = params.quote.dzap;
  const userAddress = getAddress(params.userAddress);
  const srcToken = getAddress(meta.srcToken);
  const destToken = getAddress(meta.destToken);
  const amountIn = BigInt(params.quote.inputAmountNative || meta.amount);
  const swapInputAmountNative = BigInt(
    params.quote.swapInputAmountNative || meta.amount,
  );
  const client = getDzapClient();
  const routerAddress = await getRouterAddress(client, meta.fromChain);
  const adapterAddress = getDzapAdapterAddress(meta.fromChain);
  const executorAddress = getDzapExecutorAddress(meta.fromChain);
  const useFeePath = params.quote.feeMode === TOWER_SWAP_FEE_MODE;
  const useAdapterPath = Boolean(useFeePath && adapterAddress && executorAddress);
  const minOutNativeRaw = BigInt(params.quote.minOutNative || "0");
  const minOutNative =
    minOutNativeRaw > 0n ? minOutNativeRaw : useAdapterPath ? 1n : 0n;
  const nativeSentinel = isNativeSentinelToken(srcToken);
  const approvalSpender = useAdapterPath
    ? (executorAddress as Address)
    : routerAddress;
  const approvalAmount = useAdapterPath ? amountIn : swapInputAmountNative;
  let needsApproval = !nativeSentinel;

  if (useFeePath && !useAdapterPath) {
    throw new Error(
      "DZap adapter is not configured for TowerSwapExecutor fees. Set NEXT_PUBLIC_DZAP_ADAPTER_MAINNET_ADDRESS after deploying the adapter.",
    );
  }

  if (useAdapterPath && adapterAddress && executorAddress) {
    const publicClient = createDzapPublicClient(meta.fromChain);
    const [routeAllowed, spenderAllowed] = await Promise.all([
      publicClient.readContract({
        address: executorAddress,
        abi: TOWER_SWAP_EXECUTOR_ABI,
        functionName: "routeTargets",
        args: [adapterAddress],
      }),
      publicClient.readContract({
        address: executorAddress,
        abi: TOWER_SWAP_EXECUTOR_ABI,
        functionName: "approvalSpenders",
        args: [adapterAddress],
      }),
    ]);

    if (!routeAllowed || !spenderAllowed) {
      throw new Error(
        "DZap adapter is not allowlisted on TowerSwapExecutor. Run deploy:dzap-adapter:mainnet or configure:tower-swap-executor:mainnet after deploying the adapter.",
      );
    }
  }

  if (!nativeSentinel) {
    try {
      const publicClient = createDzapPublicClient(meta.fromChain);
      const allowance = (await publicClient.readContract({
        address: srcToken as Address,
        abi: ERC20_ALLOWANCE_ABI,
        functionName: "allowance",
        args: [userAddress, approvalSpender],
      })) as bigint;
      needsApproval = allowance < approvalAmount;
    } catch (error) {
      console.warn(
        "[DZap] allowance check failed, requesting approval:",
        readErrorMessage(error),
      );
      needsApproval = true;
    }
  }

  const built = await withTimeout(
    client.buildTradeTxn({
      fromChain: meta.fromChain,
      sender: asHexAddress(useAdapterPath ? (adapterAddress as Address) : userAddress),
      refundee: asHexAddress(
        useAdapterPath ? (executorAddress as Address) : userAddress,
      ),
      gasless: false,
      disableEstimation: true,
      data: [
        {
          amount: swapInputAmountNative.toString(),
          srcToken,
          srcDecimals: meta.srcDecimals,
          destToken,
          destDecimals: meta.destDecimals,
          toChain: meta.toChain,
          protocol: meta.protocol,
          recipient: asHexAddress(
            useAdapterPath ? (executorAddress as Address) : userAddress,
          ),
          slippage: meta.slippagePercent,
          additionalInfo: meta.additionalInfo,
        },
      ],
    }),
    DZAP_BUILD_TIMEOUT_MS,
    `DZap build timed out after ${DZAP_BUILD_TIMEOUT_MS}ms`,
  );

  const evmTx = toEvmTransaction(built);
  if (!evmTx?.to || !evmTx.data) {
    throw new Error("DZap did not return an EVM swap transaction");
  }

  const dzapRouteTarget = getAddress(evmTx.to);
  if (
    useAdapterPath &&
    dzapRouteTarget.toLowerCase() !== getAddress(DZAP_ARC_ROUTER_ADDRESS).toLowerCase() &&
    dzapRouteTarget.toLowerCase() !== DZAP_PERMIT2_ADDRESS.toLowerCase()
  ) {
    throw new Error(
      `DZap swap target ${dzapRouteTarget} is not the DZap diamond or Permit2`,
    );
  }

  const swapValue = BigInt(evmTx.value || "0");
  if (useAdapterPath && swapValue > 0n) {
    throw new Error(
      "DZap native-value swaps cannot collect Tower executor fees",
    );
  }
  if (!useAdapterPath && swapValue >= approvalAmount) {
    needsApproval = false;
  }

  const approval = needsApproval
    ? {
        to: srcToken,
        data: encodeFunctionData({
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [approvalSpender, approvalAmount],
        }),
        from: userAddress,
        gasLimit: toHexQuantity(DEFAULT_APPROVAL_GAS_LIMIT),
        value: "0x0",
        label: useAdapterPath ? "Executor approval" : "Router approval",
        spender: approvalSpender,
        amountRaw: approvalAmount.toString(),
        token: srcToken,
      }
    : null;

  const updatedDestAmount = Object.values((built as any)?.updatedQuotes || {})[0];
  const rawExpectedOutput =
    updatedDestAmount ||
    params.quote.outputAmountNative ||
    params.quote.minOutNative ||
    "";
  const expectedUserOutput = typeof rawExpectedOutput === "string" ? rawExpectedOutput : String(rawExpectedOutput);
  const feeRecipient = params.quote.feeRecipient
    ? getAddress(params.quote.feeRecipient)
    : DZAP_SWAP_FEE_RECIPIENT;

  const adapterCalldata =
    useAdapterPath && adapterAddress && executorAddress
      ? encodeFunctionData({
          abi: DZAP_ADAPTER_ABI,
          functionName: "swapExactInput",
          args: [
            srcToken,
            destToken,
            swapInputAmountNative,
            minOutNative,
            executorAddress,
            dzapRouteTarget,
            evmTx.data as Hex,
          ],
        })
      : null;

  const swapData =
    adapterCalldata && executorAddress && adapterAddress
      ? encodeFunctionData({
          abi: TOWER_SWAP_EXECUTOR_ABI,
          functionName: "executeSwap",
          args: [
            {
              tokenIn: srcToken,
              tokenOut: destToken,
              amountIn,
              minAmountOut: minOutNative,
              recipient: userAddress,
              routeTarget: adapterAddress,
              approvalSpender: adapterAddress,
              routeCalldata: adapterCalldata,
            },
          ],
        })
      : (evmTx.data as Hex);

  const swap: DzapSwapTransaction = {
    to: useAdapterPath ? (executorAddress as Address) : evmTx.to,
    data: swapData,
    value: toHexQuantity(useAdapterPath ? 0n : evmTx.value || "0"),
    from: userAddress,
    gasLimit: toHexQuantity(
      useAdapterPath ? EXECUTOR_GAS_LIMIT : evmTx.gasLimit || DEFAULT_GAS_LIMIT,
    ),
    chainId: meta.fromChain,
    expectedUserOutput,
    feeMode: useAdapterPath ? TOWER_SWAP_FEE_MODE : "none",
    feeBps: useAdapterPath ? params.quote.feeBps : undefined,
    feeRecipient: useAdapterPath ? feeRecipient : undefined,
    feeToken: useAdapterPath ? srcToken : undefined,
    platformFeeAmount: useAdapterPath
      ? params.quote.platformFeeAmountNative
      : undefined,
    executorAddress: useAdapterPath ? executorAddress || undefined : undefined,
    inputToken: srcToken,
    outputToken: destToken,
    inputAmountNative: amountIn.toString(),
  };

  return { approval, swap };
}
