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

import {
  AERO_CHAIN_ID,
  AERO_MAINNET_TOKENS,
  aeroArcMainnet,
} from "@/lib/aeroDex";
import { getArcMainnetRpcUrls } from "@/lib/arcRpc";
import { getTokenDecimalsByAddress } from "@/lib/swapApiContract";

export const XYLONET_DEX_ID = "xylonet-adapter" as const;
export const XYLONET_DEX_NAME = "XyloNet" as const;
export const XYLONET_CHAIN_ID = AERO_CHAIN_ID;
export const XYLONET_QUOTE_SOURCE = "lifi" as const;

export const XYLONET_LIFI_DIAMOND =
  "0xA4072583658Fae592A3506A42431cb6316a8d40b" as Address;
export const XYLONET_LIFI_FEE_FORWARDER =
  "0xEDff4051B8286d2333149429F019dC10E23570da" as Address;
export const XYLONET_PERMIT2_ADDRESS =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;

const LIFI_QUOTE_URL = "https://li.quest/v1/quote";
const XYLONET_INTEGRATOR = "xylonet";
const XYLONET_INTEGRATOR_FEE = "0.001";
const XYLONET_QUOTE_ACCOUNT_DEFAULT =
  "0xb3966683724303400B6fECDa1963825d994B546a" as Address;

const TOWER_SWAP_FEE_MODE = "tower-swap-executor" as const;
const DEFAULT_GAS_LIMIT = 800000n;
const EXECUTOR_GAS_LIMIT = 1_600_000n;
const DEFAULT_APPROVAL_GAS_LIMIT = 100000n;
const NORMALIZED_DECIMALS = 18;
const BPS_DENOMINATOR = 10_000n;
const DEFAULT_TOWER_SWAP_FEE_BPS = 30;
const EXECUTOR_FEE_STATE_TTL_MS = 30_000;
const QUOTE_TIMEOUT_MS = 8_000;
const BUILD_TIMEOUT_MS = 20_000;
const QUOTE_CACHE_SOFT_TTL_MS = 12_000;
const QUOTE_CACHE_HARD_TTL_MS = 120_000;

const LIFI_SWAP_EXECUTOR_MAINNET_DEFAULT =
  "0xeB8940752Fa12944d3b2D736d51fA36E4dA32BC8" as Address;
const LIFI_SWAP_FEE_RECIPIENT_DEFAULT =
  "0xb3966683724303400B6fECDa1963825d994B546a" as Address;
const LIFI_ADAPTER_MAINNET_DEFAULT =
  "0x02BC1b3F3A4655a5273b914c37ED4388DEaC58FE" as Address;

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

const LIFI_ADAPTER_ABI = [
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const readErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const parseBooleanEnv = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "off") {
    return false;
  }
  if (normalized === "true" || normalized === "1" || normalized === "on") {
    return true;
  }
  return null;
};

export const isXylonetEnabled = () =>
  parseBooleanEnv(process.env.XYLONET_ENABLED) ??
  parseBooleanEnv(process.env.NEXT_PUBLIC_XYLONET_ENABLED) ??
  true;

export const isXylonetSupportedChain = (chainId: number) =>
  chainId === XYLONET_CHAIN_ID;

const resolveOptionalAddress = (value?: string | null) =>
  value && isAddress(value) ? getAddress(value) : null;

const parseTowerSwapFeeBps = (value?: string | null) => {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= Number(BPS_DENOMINATOR)
    ? parsed
    : DEFAULT_TOWER_SWAP_FEE_BPS;
};

const LIFI_SWAP_FEE_BPS = parseTowerSwapFeeBps(
  process.env.NEXT_PUBLIC_TOWER_SWAP_FEE_BPS ||
    process.env.TOWER_SWAP_FEE_BPS ||
    process.env.NEXT_PUBLIC_SWAP_FEE_BPS ||
    process.env.SWAP_FEE_BPS,
);

const LIFI_SWAP_FEE_RECIPIENT =
  resolveOptionalAddress(
    process.env.NEXT_PUBLIC_TOWER_SWAP_FEE_RECIPIENT ||
      process.env.TOWER_SWAP_FEE_RECIPIENT ||
      process.env.NEXT_PUBLIC_TOWER_SWAP_EXECUTOR_TREASURY ||
      process.env.TOWER_SWAP_EXECUTOR_TREASURY,
  ) || getAddress(LIFI_SWAP_FEE_RECIPIENT_DEFAULT);

export function getXylonetExecutorAddress(): Address {
  return (
    resolveOptionalAddress(
      process.env.NEXT_PUBLIC_TOWER_SWAP_EXECUTOR_MAINNET_ADDRESS ||
        process.env.TOWER_SWAP_EXECUTOR_MAINNET_ADDRESS,
    ) || getAddress(LIFI_SWAP_EXECUTOR_MAINNET_DEFAULT)
  );
}

export function getXylonetAdapterAddress(): Address | null {
  return (
    resolveOptionalAddress(
      process.env.NEXT_PUBLIC_LIFI_ADAPTER_MAINNET_ADDRESS ||
        process.env.LIFI_ADAPTER_MAINNET_ADDRESS ||
        process.env.NEXT_PUBLIC_XYLONET_LIFI_ADAPTER_ADDRESS,
    ) || LIFI_ADAPTER_MAINNET_DEFAULT
  );
}

type XylonetExecutorFeeState = {
  enabled: boolean;
  feeBps: number;
  treasury: Address | null;
};

let executorFeeStateCache: {
  state: XylonetExecutorFeeState;
  expiresAt: number;
} | null = null;

async function getXylonetExecutorFeeState(
  executorAddress: Address,
): Promise<XylonetExecutorFeeState> {
  if (executorFeeStateCache && Date.now() < executorFeeStateCache.expiresAt) {
    return executorFeeStateCache.state;
  }

  const disabledState: XylonetExecutorFeeState = {
    enabled: false,
    feeBps: LIFI_SWAP_FEE_BPS,
    treasury: LIFI_SWAP_FEE_RECIPIENT,
  };

  try {
    const client = createXylonetPublicClient();
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

    const feeBps =
      Number(onChainFeeBps) > 0 ? Number(onChainFeeBps) : LIFI_SWAP_FEE_BPS;
    const resolvedTreasury =
      treasury && isAddress(treasury) && treasury.toLowerCase() !== zeroAddress
        ? getAddress(treasury)
        : LIFI_SWAP_FEE_RECIPIENT;
    const state: XylonetExecutorFeeState = {
      enabled: Boolean(feeBps > 0 && resolvedTreasury),
      feeBps,
      treasury: resolvedTreasury,
    };
    executorFeeStateCache = {
      state,
      expiresAt: Date.now() + EXECUTOR_FEE_STATE_TTL_MS,
    };
    return state;
  } catch (error) {
    console.warn("[XyloNet] executor fee state unavailable:", readErrorMessage(error));
    executorFeeStateCache = {
      state: disabledState,
      expiresAt: Date.now() + EXECUTOR_FEE_STATE_TTL_MS,
    };
    return disabledState;
  }
}

const getLifiQuoteUrl = () =>
  (process.env.LIFI_API_URL || process.env.XYLONET_LIFI_API_URL || LIFI_QUOTE_URL)
    .trim()
    .replace(/\/$/, "");

const getXylonetIntegrator = () =>
  process.env.XYLONET_LIFI_INTEGRATOR?.trim() || XYLONET_INTEGRATOR;

const getXylonetIntegratorFee = () =>
  process.env.XYLONET_LIFI_FEE?.trim() || XYLONET_INTEGRATOR_FEE;

const getQuoteAccount = (account?: string) =>
  resolveOptionalAddress(account) ||
  resolveOptionalAddress(process.env.XYLONET_QUOTE_ACCOUNT) ||
  XYLONET_QUOTE_ACCOUNT_DEFAULT;

const scaleAmount = (amount: bigint, fromDecimals: number, toDecimals: number) => {
  if (fromDecimals === toDecimals) {
    return amount;
  }
  return fromDecimals < toDecimals
    ? amount * 10n ** BigInt(toDecimals - fromDecimals)
    : amount / 10n ** BigInt(fromDecimals - toDecimals);
};

const toHexQuantity = (value: bigint | string | number): Hex => {
  const asBigInt =
    typeof value === "bigint"
      ? value
      : typeof value === "number"
        ? BigInt(Math.trunc(value))
        : value.startsWith("0x")
          ? BigInt(value)
          : BigInt(value);
  return `0x${asBigInt.toString(16)}` as Hex;
};

const toBigIntQuantity = (value: unknown, fallback = 0n) => {
  const raw = asString(value);
  if (!raw) {
    return fallback;
  }
  try {
    return BigInt(raw);
  } catch {
    return fallback;
  }
};

const isNativeSentinelToken = (token: string) =>
  NATIVE_TOKEN_SENTINELS.has(token.toLowerCase());

const slippageBpsToDecimal = (slippageBps: number) => {
  const bps = Number.isFinite(slippageBps) ? Math.max(0, slippageBps) : 50;
  return (bps / 10_000).toString();
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

type LifiToken = {
  address?: string;
  decimals?: number;
  symbol?: string;
};

type LifiStep = {
  tool?: string;
  toolDetails?: { name?: string };
  action?: {
    fromToken?: LifiToken;
    toToken?: LifiToken;
    fromAmount?: string;
  };
  estimate?: {
    toAmount?: string;
  };
};

type LifiTransactionRequest = {
  to?: string;
  from?: string;
  data?: string;
  value?: string;
  gasLimit?: string;
  gasPrice?: string;
  chainId?: number;
};

type LifiQuoteResponse = {
  id?: string;
  tool?: string;
  toolDetails?: { name?: string };
  action?: {
    fromToken?: LifiToken;
    toToken?: LifiToken;
    fromAmount?: string;
    fromChainId?: number;
    toChainId?: number;
    slippage?: number;
    fromAddress?: string;
    toAddress?: string;
  };
  estimate?: {
    fromAmount?: string;
    toAmount?: string;
    toAmountMin?: string;
    fromAmountUSD?: string;
    toAmountUSD?: string;
    approvalAddress?: string;
    executionDuration?: number;
    gasCosts?: Array<{ estimate?: string; amount?: string }>;
  };
  includedSteps?: LifiStep[];
  transactionRequest?: LifiTransactionRequest;
  message?: string;
};

export type XylonetQuoteMeta = {
  source: typeof XYLONET_QUOTE_SOURCE;
  fromChain: number;
  toChain: number;
  integrator: string;
  protocol: string;
  approvalAddress: string;
  srcDecimals: number;
  destDecimals: number;
  slippagePercent: number;
  amount: string;
  srcToken: string;
  destToken: string;
  quoteId?: string;
  tool?: string;
};

export type XylonetQuote = {
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
  xylonet: XylonetQuoteMeta;
  route: {
    type: "single" | "multi";
    rawPath?: string;
    hops: Array<{
      dexId: typeof XYLONET_DEX_ID;
      dex?: typeof XYLONET_DEX_ID;
      dexName: typeof XYLONET_DEX_NAME;
      dexRouter: string;
      path: string[];
      amountIn: string;
      amountOut: string;
      priceImpact: number;
    }>;
  };
};

type CachedXylonetQuote = {
  quote: XylonetQuote;
  fetchedAt: number;
};

const xylonetQuoteCache = new Map<string, CachedXylonetQuote>();

const getQuoteCacheKey = (params: {
  srcToken: string;
  destToken: string;
  amount: string;
  slippageBps: number;
}) =>
  [
    XYLONET_CHAIN_ID,
    params.srcToken.toLowerCase(),
    params.destToken.toLowerCase(),
    params.amount,
    params.slippageBps,
  ].join(":");

const readCachedQuote = (cacheKey: string, ttlMs: number) => {
  const cached = xylonetQuoteCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.fetchedAt > ttlMs) {
    return null;
  }
  return cached.quote;
};

const parsePriceImpactBps = (quote: LifiQuoteResponse) => {
  const fromUsd = Number(quote.estimate?.fromAmountUSD);
  const toUsd = Number(quote.estimate?.toAmountUSD);
  if (Number.isFinite(fromUsd) && Number.isFinite(toUsd) && fromUsd > 0) {
    return Math.round(((fromUsd - toUsd) / fromUsd) * 10_000);
  }
  return 0;
};

const createXylonetPublicClient = () => {
  const urls = getArcMainnetRpcUrls();
  return createPublicClient({
    chain: aeroArcMainnet,
    transport: fallback(
      urls.map((url) =>
        http(url, {
          retryCount: 1,
          timeout: 8_000,
        }),
      ),
    ),
  });
};

export function getXylonetDexInfo() {
  return {
    id: XYLONET_DEX_ID,
    name: XYLONET_DEX_NAME,
    enabled: isXylonetEnabled(),
    type: "aggregator",
    chainId: XYLONET_CHAIN_ID,
    routerAddress: XYLONET_LIFI_DIAMOND,
    permit2Address: XYLONET_PERMIT2_ADDRESS,
    supportedTokens: [
      AERO_MAINNET_TOKENS.USDC,
      AERO_MAINNET_TOKENS.EURC,
      AERO_MAINNET_TOKENS.cirBTC,
    ],
  } as const;
}

export function isXylonetQuote(quote: unknown): quote is XylonetQuote {
  if (!isRecord(quote) || !isRecord(quote.xylonet)) {
    return false;
  }

  return (
    quote.xylonet.source === XYLONET_QUOTE_SOURCE &&
    typeof quote.xylonet.protocol === "string" &&
    quote.xylonet.protocol.length > 0
  );
}

const fetchLifiQuote = async (params: {
  srcToken: Address;
  destToken: Address;
  amount: string;
  slippageBps: number;
  fromAddress: Address;
  toAddress?: Address;
  skipSimulation?: boolean;
}): Promise<LifiQuoteResponse> => {
  const url = new URL(getLifiQuoteUrl());
  url.searchParams.set("fromChain", String(XYLONET_CHAIN_ID));
  url.searchParams.set("toChain", String(XYLONET_CHAIN_ID));
  url.searchParams.set("fromToken", params.srcToken);
  url.searchParams.set("toToken", params.destToken);
  url.searchParams.set("fromAmount", params.amount);
  url.searchParams.set("fromAddress", params.fromAddress);
  url.searchParams.set("toAddress", params.toAddress || params.fromAddress);
  url.searchParams.set("slippage", slippageBpsToDecimal(params.slippageBps));
  url.searchParams.set("integrator", getXylonetIntegrator());
  url.searchParams.set("fee", getXylonetIntegratorFee());
  if (params.skipSimulation !== false) {
    url.searchParams.set("skipSimulation", "true");
  }

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await response.json()) as LifiQuoteResponse;

  if (!response.ok) {
    throw new Error(
      asString(payload.message) || `LI.FI quote failed with status ${response.status}`,
    );
  }

  return payload;
};

const mapLifiQuote = (params: {
  srcToken: Address;
  destToken: Address;
  amountIn: bigint;
  swapInputAmountNative: bigint;
  srcDecimals: number;
  destDecimals: number;
  slippageBps: number;
  lifiQuote: LifiQuoteResponse;
  shouldCollectExecutorFee: boolean;
  feeBps: number;
  treasury: Address | null;
  platformFeeAmountNative: bigint;
}): XylonetQuote | null => {
  const amountOut = toBigIntQuantity(
    params.lifiQuote.estimate?.toAmount,
    0n,
  );
  const minOut = toBigIntQuantity(
    params.lifiQuote.estimate?.toAmountMin,
    0n,
  );
  if (amountOut <= 0n) {
    return null;
  }

  const approvalAddress =
    resolveOptionalAddress(params.lifiQuote.estimate?.approvalAddress) ||
    resolveOptionalAddress(params.lifiQuote.transactionRequest?.to) ||
    XYLONET_LIFI_DIAMOND;
  const routerAddress =
    resolveOptionalAddress(params.lifiQuote.transactionRequest?.to) ||
    XYLONET_LIFI_DIAMOND;
  const priceImpact = parsePriceImpactBps(params.lifiQuote);
  const protocol =
    asString(params.lifiQuote.toolDetails?.name) ||
    asString(params.lifiQuote.tool) ||
    "LI.FI";
  const gasEstimate = toBigIntQuantity(
    params.lifiQuote.estimate?.gasCosts?.[0]?.estimate ||
      params.lifiQuote.transactionRequest?.gasLimit,
    DEFAULT_GAS_LIMIT,
  ).toString();

  const includedSteps = Array.isArray(params.lifiQuote.includedSteps)
    ? params.lifiQuote.includedSteps
    : [];
  const hops =
    includedSteps.length > 0
      ? includedSteps.map((step) => ({
          dexId: XYLONET_DEX_ID,
          dex: XYLONET_DEX_ID,
          dexName: XYLONET_DEX_NAME,
          dexRouter: routerAddress,
          path: [
            resolveOptionalAddress(step.action?.fromToken?.address) ||
              params.srcToken,
            resolveOptionalAddress(step.action?.toToken?.address) ||
              params.destToken,
          ],
          amountIn: asString(step.action?.fromAmount) || params.swapInputAmountNative.toString(),
          amountOut: asString(step.estimate?.toAmount) || amountOut.toString(),
          priceImpact,
        }))
      : [
          {
            dexId: XYLONET_DEX_ID,
            dex: XYLONET_DEX_ID,
            dexName: XYLONET_DEX_NAME,
            dexRouter: routerAddress,
            path: [params.srcToken, params.destToken],
            amountIn: params.swapInputAmountNative.toString(),
            amountOut: amountOut.toString(),
            priceImpact,
          },
        ];

  return {
    inputToken: params.srcToken,
    outputToken: params.destToken,
    inputAmount: scaleAmount(
      params.amountIn,
      params.srcDecimals,
      NORMALIZED_DECIMALS,
    ).toString(),
    swapInputAmount: scaleAmount(
      params.swapInputAmountNative,
      params.srcDecimals,
      NORMALIZED_DECIMALS,
    ).toString(),
    outputAmount: scaleAmount(
      amountOut,
      params.destDecimals,
      NORMALIZED_DECIMALS,
    ).toString(),
    minOut: scaleAmount(minOut, params.destDecimals, NORMALIZED_DECIMALS).toString(),
    inputAmountNative: params.amountIn.toString(),
    swapInputAmountNative: params.swapInputAmountNative.toString(),
    outputAmountNative: amountOut.toString(),
    minOutNative: minOut.toString(),
    priceImpact,
    gasEstimate: params.shouldCollectExecutorFee
      ? EXECUTOR_GAS_LIMIT.toString()
      : gasEstimate,
    slippage: params.slippageBps,
    feeMode: params.shouldCollectExecutorFee ? TOWER_SWAP_FEE_MODE : "none",
    feeBps: params.shouldCollectExecutorFee ? params.feeBps : undefined,
    feeRecipient: params.shouldCollectExecutorFee
      ? params.treasury || undefined
      : undefined,
    platformFeeAmount:
      params.platformFeeAmountNative > 0n
        ? scaleAmount(
            params.platformFeeAmountNative,
            params.srcDecimals,
            NORMALIZED_DECIMALS,
          ).toString()
        : undefined,
    platformFeeAmountNative:
      params.platformFeeAmountNative > 0n
        ? params.platformFeeAmountNative.toString()
        : undefined,
    xylonet: {
      source: XYLONET_QUOTE_SOURCE,
      fromChain: XYLONET_CHAIN_ID,
      toChain: XYLONET_CHAIN_ID,
      integrator: getXylonetIntegrator(),
      protocol,
      approvalAddress,
      srcDecimals: params.srcDecimals,
      destDecimals: params.destDecimals,
      slippagePercent: Number(slippageBpsToDecimal(params.slippageBps)),
      amount: params.swapInputAmountNative.toString(),
      srcToken: params.srcToken,
      destToken: params.destToken,
      quoteId: asString(params.lifiQuote.id) || undefined,
      tool: asString(params.lifiQuote.tool) || undefined,
    },
    route: {
      type: hops.length > 1 ? "multi" : "single",
      rawPath: protocol,
      hops,
    },
  };
};

export async function getXylonetQuote(params: {
  inputToken: string;
  outputToken: string;
  inputAmount: string;
  slippageBps: number;
  chainId: number;
  account?: string;
}): Promise<XylonetQuote | null> {
  if (!isXylonetEnabled() || !isXylonetSupportedChain(params.chainId)) {
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
  const adapterAddress = getXylonetAdapterAddress();
  const executorAddress = getXylonetExecutorAddress();
  const canCollectExecutorFee =
    Boolean(adapterAddress && executorAddress) &&
    !isNativeSentinelToken(srcToken) &&
    !isNativeSentinelToken(destToken);
  const feeState = canCollectExecutorFee
    ? await getXylonetExecutorFeeState(executorAddress)
    : {
        enabled: false,
        feeBps: LIFI_SWAP_FEE_BPS,
        treasury: LIFI_SWAP_FEE_RECIPIENT,
      };
  const shouldCollectExecutorFee = canCollectExecutorFee && feeState.enabled;
  const platformFeeAmountNative = shouldCollectExecutorFee
    ? (amountIn * BigInt(feeState.feeBps)) / BPS_DENOMINATOR
    : 0n;
  const swapInputAmountNative = amountIn - platformFeeAmountNative;

  if (swapInputAmountNative <= 0n) {
    return null;
  }

  const cacheKey = getQuoteCacheKey({
    srcToken,
    destToken,
    amount: amountIn.toString(),
    slippageBps: params.slippageBps,
  });
  const freshCachedQuote = readCachedQuote(cacheKey, QUOTE_CACHE_SOFT_TTL_MS);
  if (freshCachedQuote) {
    return freshCachedQuote;
  }

  try {
    const quoteAccount = shouldCollectExecutorFee
      ? (adapterAddress as Address)
      : getQuoteAccount(params.account);
    const lifiQuote = await withTimeout(
      fetchLifiQuote({
        srcToken,
        destToken,
        amount: swapInputAmountNative.toString(),
        slippageBps: params.slippageBps,
        fromAddress: quoteAccount,
        toAddress: shouldCollectExecutorFee ? executorAddress : quoteAccount,
        skipSimulation: true,
      }),
      QUOTE_TIMEOUT_MS,
      `XyloNet quote timed out after ${QUOTE_TIMEOUT_MS}ms`,
    );
    const mappedQuote = mapLifiQuote({
      srcToken,
      destToken,
      amountIn,
      swapInputAmountNative,
      srcDecimals,
      destDecimals,
      slippageBps: params.slippageBps,
      lifiQuote,
      shouldCollectExecutorFee,
      feeBps: feeState.feeBps,
      treasury: feeState.treasury,
      platformFeeAmountNative,
    });
    if (!mappedQuote) {
      return null;
    }

    xylonetQuoteCache.set(cacheKey, {
      quote: mappedQuote,
      fetchedAt: Date.now(),
    });
    return mappedQuote;
  } catch (error) {
    const staleCachedQuote = readCachedQuote(cacheKey, QUOTE_CACHE_HARD_TTL_MS);
    if (staleCachedQuote) {
      console.warn(
        "[XyloNet] quote unavailable, reusing cached route:",
        readErrorMessage(error),
      );
      return staleCachedQuote;
    }

    console.warn("[XyloNet] quote unavailable:", readErrorMessage(error));
    return null;
  }
}

export async function buildXylonetSwapTransaction(params: {
  quote: XylonetQuote;
  userAddress: string;
}) {
  if (!isAddress(params.userAddress)) {
    throw new Error("Missing userAddress for XyloNet swap");
  }

  const meta = params.quote.xylonet;
  const userAddress = getAddress(params.userAddress);
  const srcToken = getAddress(meta.srcToken);
  const destToken = getAddress(meta.destToken);
  const amountIn = BigInt(params.quote.inputAmountNative || meta.amount);
  const swapInputAmountNative = BigInt(
    params.quote.swapInputAmountNative || meta.amount,
  );
  const adapterAddress = getXylonetAdapterAddress();
  const executorAddress = getXylonetExecutorAddress();
  const useFeePath = params.quote.feeMode === TOWER_SWAP_FEE_MODE;
  const useAdapterPath = Boolean(useFeePath && adapterAddress && executorAddress);
  const minOutNativeRaw = BigInt(params.quote.minOutNative || "0");
  const minOutNative =
    minOutNativeRaw > 0n ? minOutNativeRaw : useAdapterPath ? 1n : 0n;
  const nativeSentinel = isNativeSentinelToken(srcToken);
  const approvalSpender = useAdapterPath
    ? (executorAddress as Address)
    : getAddress(meta.approvalAddress || XYLONET_LIFI_DIAMOND);
  const approvalAmount = useAdapterPath ? amountIn : swapInputAmountNative;
  let needsApproval = !nativeSentinel;

  if (useFeePath && !useAdapterPath) {
    throw new Error(
      "LI.FI adapter is not configured for TowerSwapExecutor fees. Set NEXT_PUBLIC_LIFI_ADAPTER_MAINNET_ADDRESS after deploying the adapter.",
    );
  }

  if (useAdapterPath && adapterAddress && executorAddress) {
    const publicClient = createXylonetPublicClient();
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
        "LI.FI adapter is not allowlisted on TowerSwapExecutor. Run deploy:lifi-adapter:mainnet or configure:tower-swap-executor:mainnet after deploying the adapter.",
      );
    }
  }

  const lifiFromAddress = useAdapterPath
    ? (adapterAddress as Address)
    : userAddress;
  const lifiToAddress = useAdapterPath
    ? (executorAddress as Address)
    : userAddress;

  const lifiQuote = await withTimeout(
    fetchLifiQuote({
      srcToken,
      destToken,
      amount: swapInputAmountNative.toString(),
      slippageBps: params.quote.slippage,
      fromAddress: lifiFromAddress,
      toAddress: lifiToAddress,
      skipSimulation: true,
    }),
    BUILD_TIMEOUT_MS,
    `XyloNet build timed out after ${BUILD_TIMEOUT_MS}ms`,
  );

  const transactionRequest = lifiQuote.transactionRequest;
  if (
    !transactionRequest?.to ||
    !transactionRequest.data ||
    !isAddress(transactionRequest.to)
  ) {
    throw new Error("XyloNet did not return an EVM swap transaction");
  }

  const routeTarget = getAddress(transactionRequest.to);
  if (
    routeTarget.toLowerCase() !== XYLONET_LIFI_DIAMOND.toLowerCase() &&
    routeTarget.toLowerCase() !== XYLONET_PERMIT2_ADDRESS.toLowerCase()
  ) {
    throw new Error(
      `XyloNet swap target ${routeTarget} is not the LI.FI Diamond or Permit2`,
    );
  }

  const swapValue = toBigIntQuantity(transactionRequest.value, 0n);
  if (useAdapterPath && swapValue > 0n) {
    throw new Error(
      "XyloNet native-value swaps cannot collect Tower executor fees",
    );
  }

  if (!nativeSentinel) {
    try {
      const publicClient = createXylonetPublicClient();
      const allowance = (await publicClient.readContract({
        address: srcToken,
        abi: ERC20_ALLOWANCE_ABI,
        functionName: "allowance",
        args: [userAddress, approvalSpender],
      })) as bigint;
      needsApproval = allowance < approvalAmount;
    } catch (error) {
      console.warn(
        "[XyloNet] allowance check failed, requesting approval:",
        readErrorMessage(error),
      );
      needsApproval = true;
    }
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
        label: useAdapterPath ? "Executor approval" : "XyloNet approval",
        spender: approvalSpender,
        amountRaw: approvalAmount.toString(),
        token: srcToken,
      }
    : null;

  const expectedUserOutput =
    asString(lifiQuote.estimate?.toAmount) ||
    params.quote.outputAmountNative ||
    params.quote.minOutNative;
  const feeRecipient = params.quote.feeRecipient
    ? getAddress(params.quote.feeRecipient)
    : LIFI_SWAP_FEE_RECIPIENT;

  const adapterCalldata =
    useAdapterPath && adapterAddress && executorAddress
      ? encodeFunctionData({
          abi: LIFI_ADAPTER_ABI,
          functionName: "swapExactInput",
          args: [
            srcToken,
            destToken,
            swapInputAmountNative,
            minOutNative,
            executorAddress,
            routeTarget,
            transactionRequest.data as Hex,
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
      : (transactionRequest.data as Hex);

  return {
    approval,
    swap: {
      to: useAdapterPath ? (executorAddress as Address) : routeTarget,
      data: swapData,
      value: toHexQuantity(useAdapterPath ? 0n : transactionRequest.value || "0"),
      from: userAddress,
      gasLimit: toHexQuantity(
        useAdapterPath
          ? EXECUTOR_GAS_LIMIT
          : transactionRequest.gasLimit ||
            params.quote.gasEstimate ||
            DEFAULT_GAS_LIMIT,
      ),
      chainId: XYLONET_CHAIN_ID,
      expectedUserOutput,
      feeMode: useAdapterPath ? TOWER_SWAP_FEE_MODE : "none",
      feeBps: useAdapterPath ? params.quote.feeBps : undefined,
      feeRecipient: useAdapterPath ? feeRecipient : undefined,
      feeToken: useAdapterPath ? srcToken : undefined,
      platformFeeAmount: useAdapterPath
        ? params.quote.platformFeeAmountNative
        : undefined,
      executorAddress: useAdapterPath ? executorAddress : undefined,
      inputToken: srcToken,
      outputToken: destToken,
      inputAmountNative: amountIn.toString(),
    },
  };
}
