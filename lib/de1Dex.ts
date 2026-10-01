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
import { isDe1Enabled } from "@/lib/de1Enabled";
import { getTokenDecimalsByAddress } from "@/lib/swapApiContract";

export { isDe1Enabled };

export const DE1_DEX_ID = "de1" as const;
export const DE1_DEX_NAME = "De1" as const;
export const DE1_CHAIN_ID = AERO_CHAIN_ID;
export const DE1_CHAIN_SLUG = "arc" as const;
export const DE1_QUOTE_SOURCE = "de1" as const;
export const DE1_NATIVE_TOKEN_ADDRESS =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address;
export const DE1_EXCHANGE_ADDRESS =
  "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64" as Address;

const DE1_API_BASE_URL = "https://open-api.de1.exchange/v4";
const NORMALIZED_DECIMALS = 18;
const BPS_DENOMINATOR = 10_000n;
const QUOTE_TIMEOUT_MS = 8_000;
const BUILD_TIMEOUT_MS = 10_000;
const GAS_PRICE_TTL_MS = 20_000;
const QUOTE_CACHE_SOFT_TTL_MS = 8_000;
const QUOTE_CACHE_HARD_TTL_MS = 120_000;
const DEFAULT_QUOTE_GAS_LIMIT = 400_000n;
const DEFAULT_APPROVAL_GAS_LIMIT = 80_000n;
const EXECUTOR_GAS_LIMIT = 1_600_000n;
const DEFAULT_TOWER_SWAP_FEE_BPS = 30;
const EXECUTOR_FEE_STATE_TTL_MS = 30_000;
const TOWER_SWAP_FEE_MODE = "tower-swap-executor" as const;
const TOWER_SWAP_EXECUTOR_MAINNET_DEFAULT =
  "0xeB8940752Fa12944d3b2D736d51fA36E4dA32BC8" as Address;
const DE1_SWAP_FEE_RECIPIENT_DEFAULT =
  "0xb3966683724303400B6fECDa1963825e994B546a" as Address;
const MIN_SLIPPAGE_PERCENT = 0.05;
const MAX_SLIPPAGE_PERCENT = 50;

const DE1_SUPPORTED_TOKENS = [
  AERO_MAINNET_TOKENS.USDC,
  AERO_MAINNET_TOKENS.EURC,
  AERO_MAINNET_TOKENS.cirBTC,
] as const;

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

const DE1_ADAPTER_ABI = [
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

export type De1QuoteMeta = {
  source: typeof DE1_QUOTE_SOURCE;
  chain: typeof DE1_CHAIN_SLUG;
  fromChain: number;
  toChain: number;
  exchange: Address;
  gasPriceDecimals: string;
  inAmount: string;
  outAmount: string;
  priceImpact: string;
  srcDecimals: number;
  destDecimals: number;
  expiresAt: number;
  quotedAt: number;
};

export type De1Quote = {
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
  de1: De1QuoteMeta;
  route: {
    type: "single" | "multi" | "split";
    rawPath?: string;
    hops: Array<{
      dexId: typeof DE1_DEX_ID;
      dex?: typeof DE1_DEX_ID;
      dexName: typeof DE1_DEX_NAME;
      dexRouter: string;
      path: string[];
      amountIn: string;
      amountOut: string;
      priceImpact: number;
    }>;
  };
};

export type De1SwapTransaction = {
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
  label?: string;
};

type De1ApiToken = {
  address?: string;
  decimals?: number;
  symbol?: string;
};

type De1QuoteResponse = {
  code?: number;
  data?: {
    inToken?: De1ApiToken;
    outToken?: De1ApiToken;
    inAmount?: string;
    outAmount?: string;
    estimatedGas?: string | number;
    minOutAmount?: string;
    exchange?: string;
    to?: string;
    from?: string;
    value?: string;
    gasPrice?: string;
    data?: string;
    chainId?: number;
    price_impact?: string;
    path?: {
      parts?: number;
      routes?: Array<{
        subRoutes?: Array<{ dex?: string }>;
      }>;
    };
    dexes?: Array<{ dexIndex?: number; dexCode?: string }>;
  };
  msg?: string;
  message?: string;
};

type De1GasPriceTier =
  | number
  | string
  | {
      legacyGasPrice?: string | number;
    };

type De1GasPriceResponse = {
  code?: number;
  data?: {
    standard?: De1GasPriceTier;
    fast?: De1GasPriceTier;
    instant?: De1GasPriceTier;
  };
};

type CachedQuote = {
  quote: De1Quote;
  fetchedAt: number;
};

let cachedGasPrice: { value: bigint; fetchedAt: number } | null = null;
const de1QuoteCache = new Map<string, CachedQuote>();

type De1ExecutorFeeState = {
  enabled: boolean;
  feeBps: number;
  treasury: Address | null;
};

let executorFeeStateCache: {
  state: De1ExecutorFeeState;
  expiresAt: number;
} | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown) => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
};

const toBigIntQuantity = (value: unknown, fallback = 0n) => {
  const raw = asString(value);
  if (!raw) {
    return fallback;
  }

  try {
    if (raw.startsWith("0x") || raw.startsWith("0X")) {
      return BigInt(raw);
    }
    if (!/^\d+$/.test(raw)) {
      return fallback;
    }
    return BigInt(raw);
  } catch {
    return fallback;
  }
};

const toHexQuantity = (value: bigint) => `0x${value.toString(16)}` as Hex;

const scaleAmount = (amount: bigint, fromDecimals: number, toDecimals: number) => {
  if (fromDecimals === toDecimals) {
    return amount;
  }

  return fromDecimals < toDecimals
    ? amount * 10n ** BigInt(toDecimals - fromDecimals)
    : amount / 10n ** BigInt(fromDecimals - toDecimals);
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

const readErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const resolveOptionalAddress = (value?: string | null) =>
  value && isAddress(value) ? getAddress(value) : null;

const parseTowerSwapFeeBps = (value?: string | null) => {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= Number(BPS_DENOMINATOR)
    ? parsed
    : DEFAULT_TOWER_SWAP_FEE_BPS;
};

const DE1_SWAP_FEE_BPS = parseTowerSwapFeeBps(
  process.env.NEXT_PUBLIC_TOWER_SWAP_FEE_BPS ||
    process.env.TOWER_SWAP_FEE_BPS ||
    process.env.NEXT_PUBLIC_SWAP_FEE_BPS ||
    process.env.SWAP_FEE_BPS,
);

const DE1_SWAP_FEE_RECIPIENT =
  resolveOptionalAddress(
    process.env.NEXT_PUBLIC_TOWER_SWAP_FEE_RECIPIENT ||
      process.env.TOWER_SWAP_FEE_RECIPIENT ||
      process.env.NEXT_PUBLIC_TOWER_SWAP_EXECUTOR_TREASURY ||
      process.env.TOWER_SWAP_EXECUTOR_TREASURY,
  ) || getAddress(DE1_SWAP_FEE_RECIPIENT_DEFAULT);

export function getDe1ExecutorAddress(): Address {
  return (
    resolveOptionalAddress(
      process.env.NEXT_PUBLIC_TOWER_SWAP_EXECUTOR_MAINNET_ADDRESS ||
        process.env.TOWER_SWAP_EXECUTOR_MAINNET_ADDRESS,
    ) || getAddress(TOWER_SWAP_EXECUTOR_MAINNET_DEFAULT)
  );
}

export function getDe1AdapterAddress(): Address | null {
  return resolveOptionalAddress(
    process.env.NEXT_PUBLIC_DE1_ADAPTER_MAINNET_ADDRESS ||
      process.env.DE1_ADAPTER_MAINNET_ADDRESS ||
      process.env.NEXT_PUBLIC_DE1_ADAPTER_ADDRESS,
  );
}

const createDe1PublicClient = () =>
  createPublicClient({
    chain: aeroArcMainnet,
    transport: fallback(
      getArcMainnetRpcUrls().map((rpcUrl) => http(rpcUrl)),
      { rank: false },
    ),
  });

async function getDe1ExecutorFeeState(
  executorAddress: Address,
): Promise<De1ExecutorFeeState> {
  if (executorFeeStateCache && Date.now() < executorFeeStateCache.expiresAt) {
    return executorFeeStateCache.state;
  }

  const disabledState: De1ExecutorFeeState = {
    enabled: false,
    feeBps: DE1_SWAP_FEE_BPS,
    treasury: DE1_SWAP_FEE_RECIPIENT,
  };

  try {
    const client = createDe1PublicClient();
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
      Number(onChainFeeBps) > 0 ? Number(onChainFeeBps) : DE1_SWAP_FEE_BPS;
    const resolvedTreasury =
      treasury && isAddress(treasury) && treasury.toLowerCase() !== zeroAddress
        ? getAddress(treasury)
        : DE1_SWAP_FEE_RECIPIENT;
    const state: De1ExecutorFeeState = {
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
    console.warn("[De1] executor fee state unavailable:", readErrorMessage(error));
    executorFeeStateCache = {
      state: disabledState,
      expiresAt: Date.now() + EXECUTOR_FEE_STATE_TTL_MS,
    };
    return disabledState;
  }
}

const isNativeToken = (token: Address) =>
  token.toLowerCase() === zeroAddress.toLowerCase() ||
  token.toLowerCase() === DE1_NATIVE_TOKEN_ADDRESS.toLowerCase();

const toDe1TokenAddress = (token: Address) =>
  isNativeToken(token) ? DE1_NATIVE_TOKEN_ADDRESS : token;

const slippageBpsToPercent = (slippageBps: number) => {
  const percent = slippageBps / 100;
  return Math.min(
    MAX_SLIPPAGE_PERCENT,
    Math.max(MIN_SLIPPAGE_PERCENT, Number(percent.toFixed(2))),
  );
};

const parsePriceImpactBps = (value?: string) => {
  const raw = asString(value).replace("%", "");
  const percent = Number.parseFloat(raw);
  if (!Number.isFinite(percent)) {
    return 0;
  }
  return Math.max(0, Math.round(percent * 100));
};

const getQuoteCacheKey = (params: {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: string;
  slippageBps: number;
  adapterAddress?: Address | null;
}) =>
  [
    params.tokenIn.toLowerCase(),
    params.tokenOut.toLowerCase(),
    params.amountIn,
    params.slippageBps,
    (params.adapterAddress || "direct").toLowerCase(),
  ].join(":");

const readCachedQuote = (cacheKey: string, ttlMs: number) => {
  const cached = de1QuoteCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.fetchedAt > ttlMs) {
    return null;
  }
  return cached.quote;
};

export const isDe1SupportedChain = (chainId: number) =>
  chainId === DE1_CHAIN_ID;

export const isDe1SupportedToken = (token: string) => {
  if (!isAddress(token)) {
    return false;
  }
  const normalized = getAddress(token).toLowerCase();
  return DE1_SUPPORTED_TOKENS.some(
    (supported) => supported.toLowerCase() === normalized,
  );
};

export const isDe1SupportedPair = (inputToken: string, outputToken: string) =>
  isDe1SupportedToken(inputToken) &&
  isDe1SupportedToken(outputToken) &&
  inputToken.toLowerCase() !== outputToken.toLowerCase();

export const normalizeDe1DexId = (dexId?: string) => {
  const normalized = String(dexId || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");

  if (
    normalized === DE1_DEX_ID ||
    normalized === "de1-exchange" ||
    normalized === "de1exchange" ||
    normalized === "de¹" ||
    normalized.includes("de1")
  ) {
    return DE1_DEX_ID;
  }

  return null;
};

export const getDe1DexInfo = () =>
  ({
    id: DE1_DEX_ID,
    name: DE1_DEX_NAME,
    enabled: isDe1Enabled(),
    type: "aggregator",
    chainId: DE1_CHAIN_ID,
    routerAddress: getDe1AdapterAddress() || DE1_EXCHANGE_ADDRESS,
    supportedTokens: DE1_SUPPORTED_TOKENS,
  }) as const;

export const isDe1Quote = (quote: unknown): quote is De1Quote => {
  if (!isRecord(quote) || !isRecord(quote.de1)) {
    return false;
  }

  return (
    quote.de1.source === DE1_QUOTE_SOURCE &&
    typeof quote.de1.exchange === "string" &&
    isAddress(quote.de1.exchange)
  );
};

const getDe1Headers = () => {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "TowerExchange/1.0 (+https://tower.exchange)",
    Origin: "https://tower.exchange",
    Referer: "https://tower.exchange/",
  };
  const apiKey = process.env.DE1_API_KEY?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
};

const fetchDe1Json = async <T,>(
  path: string,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> => {
  const requestOnce = (headers: Record<string, string>) =>
    withTimeout(
      fetch(`${DE1_API_BASE_URL}/${path}`, {
        method: "GET",
        headers,
        cache: "no-store",
      }),
      timeoutMs,
      timeoutMessage,
    );

  const headers = getDe1Headers();
  let response = await requestOnce(headers);

  if (response.status === 403 && headers.Authorization) {
    const { Authorization: _authorization, ...headersWithoutAuth } = headers;
    response = await requestOnce(headersWithoutAuth);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `De1 ${path} failed (${response.status}): ${body.slice(0, 240) || response.statusText}`,
    );
  }

  return (await response.json()) as T;
};

const readGasPriceDecimals = (value: unknown): bigint => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return BigInt(Math.trunc(value));
  }

  if (typeof value === "string") {
    return toBigIntQuantity(value, 0n);
  }

  if (isRecord(value)) {
    return toBigIntQuantity(value.legacyGasPrice, 0n);
  }

  return 0n;
};

const getDe1GasPriceDecimals = async () => {
  const now = Date.now();
  if (cachedGasPrice && now - cachedGasPrice.fetchedAt < GAS_PRICE_TTL_MS) {
    return cachedGasPrice.value;
  }

  const payload = await fetchDe1Json<De1GasPriceResponse>(
    `${DE1_CHAIN_SLUG}/gasPrice`,
    QUOTE_TIMEOUT_MS,
    `De1 gasPrice timed out after ${QUOTE_TIMEOUT_MS}ms`,
  );

  const gasPrice =
    readGasPriceDecimals(payload.data?.standard) ||
    readGasPriceDecimals(payload.data?.fast) ||
    readGasPriceDecimals(payload.data?.instant);
  if (gasPrice <= 0n) {
    throw new Error("De1 gasPrice returned an empty value");
  }

  cachedGasPrice = { value: gasPrice, fetchedAt: now };
  return gasPrice;
};

const resolveRouteType = (
  payload: De1QuoteResponse["data"],
): De1Quote["route"]["type"] => {
  const routeCount = payload?.path?.routes?.length ?? 0;
  const hopCount =
    payload?.path?.routes?.reduce(
      (sum, route) => sum + (route.subRoutes?.length ?? 0),
      0,
    ) ?? 0;

  if (routeCount > 1) {
    return "split";
  }
  if (hopCount > 1) {
    return "multi";
  }
  return "single";
};

const mapDe1Quote = (params: {
  payload: De1QuoteResponse["data"];
  srcToken: Address;
  destToken: Address;
  amountIn: bigint;
  swapInputAmountNative: bigint;
  srcDecimals: number;
  destDecimals: number;
  slippageBps: number;
  gasPriceDecimals: bigint;
  shouldCollectExecutorFee: boolean;
  feeBps: number;
  treasury: Address | null;
  platformFeeAmountNative: bigint;
}): De1Quote | null => {
  const outAmount = toBigIntQuantity(params.payload?.outAmount, 0n);
  if (outAmount <= 0n) {
    return null;
  }

  const exchange = isAddress(asString(params.payload?.exchange))
    ? getAddress(asString(params.payload?.exchange))
    : isAddress(asString(params.payload?.to))
      ? getAddress(asString(params.payload?.to))
      : DE1_EXCHANGE_ADDRESS;
  const minOutNative =
    (outAmount * (BPS_DENOMINATOR - BigInt(Math.max(0, params.slippageBps)))) /
    BPS_DENOMINATOR;
  const priceImpact = parsePriceImpactBps(params.payload?.price_impact);
  const quotedAt = Date.now();
  const dexCodes = (params.payload?.dexes ?? [])
    .map((entry) => asString(entry.dexCode))
    .filter(Boolean);
  const rawPath = dexCodes.join(" -> ") || DE1_DEX_NAME;

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
      outAmount,
      params.destDecimals,
      NORMALIZED_DECIMALS,
    ).toString(),
    minOut: scaleAmount(
      minOutNative,
      params.destDecimals,
      NORMALIZED_DECIMALS,
    ).toString(),
    inputAmountNative: params.amountIn.toString(),
    swapInputAmountNative: params.swapInputAmountNative.toString(),
    outputAmountNative: outAmount.toString(),
    minOutNative: minOutNative.toString(),
    priceImpact,
    gasEstimate: params.shouldCollectExecutorFee
      ? EXECUTOR_GAS_LIMIT.toString()
      : toBigIntQuantity(
          params.payload?.estimatedGas,
          DEFAULT_QUOTE_GAS_LIMIT,
        ).toString(),
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
    de1: {
      source: DE1_QUOTE_SOURCE,
      chain: DE1_CHAIN_SLUG,
      fromChain: DE1_CHAIN_ID,
      toChain: DE1_CHAIN_ID,
      exchange,
      gasPriceDecimals: params.gasPriceDecimals.toString(),
      inAmount: params.swapInputAmountNative.toString(),
      outAmount: outAmount.toString(),
      priceImpact: asString(params.payload?.price_impact),
      srcDecimals: params.srcDecimals,
      destDecimals: params.destDecimals,
      expiresAt: quotedAt + QUOTE_CACHE_HARD_TTL_MS,
      quotedAt,
    },
    route: {
      type: resolveRouteType(params.payload),
      rawPath,
      hops: [
        {
          dexId: DE1_DEX_ID,
          dex: DE1_DEX_ID,
          dexName: DE1_DEX_NAME,
          dexRouter: exchange,
          path: [params.srcToken, params.destToken],
          amountIn: params.swapInputAmountNative.toString(),
          amountOut: outAmount.toString(),
          priceImpact,
        },
      ],
    },
  };
};

export async function getDe1Quote(params: {
  inputToken: string;
  outputToken: string;
  inputAmount: string;
  slippageBps: number;
  chainId: number;
}): Promise<De1Quote | null> {
  if (!isDe1Enabled() || !isDe1SupportedChain(params.chainId)) {
    return null;
  }

  if (!isDe1SupportedPair(params.inputToken, params.outputToken)) {
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
  const adapterAddress = getDe1AdapterAddress();
  const cacheKey = getQuoteCacheKey({
    tokenIn: srcToken,
    tokenOut: destToken,
    amountIn: amountIn.toString(),
    slippageBps: params.slippageBps,
    adapterAddress,
  });
  const freshCachedQuote = readCachedQuote(cacheKey, QUOTE_CACHE_SOFT_TTL_MS);
  if (freshCachedQuote) {
    return freshCachedQuote;
  }

  const staleCachedQuote = readCachedQuote(cacheKey, QUOTE_CACHE_HARD_TTL_MS);

  try {
    const executorAddress = getDe1ExecutorAddress();
    const canCollectExecutorFee =
      Boolean(adapterAddress && executorAddress) &&
      !isNativeToken(srcToken) &&
      !isNativeToken(destToken);
    const disabledFeeState: De1ExecutorFeeState = {
      enabled: false,
      feeBps: DE1_SWAP_FEE_BPS,
      treasury: DE1_SWAP_FEE_RECIPIENT,
    };
    const assumedFeeState: De1ExecutorFeeState = canCollectExecutorFee
      ? executorFeeStateCache?.state ?? {
          enabled: true,
          feeBps: DE1_SWAP_FEE_BPS,
          treasury: DE1_SWAP_FEE_RECIPIENT,
        }
      : disabledFeeState;
    if (canCollectExecutorFee && !executorFeeStateCache) {
      void getDe1ExecutorFeeState(executorAddress);
    }
    const feeState = assumedFeeState;
    const shouldCollectExecutorFee = canCollectExecutorFee && feeState.enabled;
    const platformFeeAmountNative = shouldCollectExecutorFee
      ? (amountIn * BigInt(feeState.feeBps)) / BPS_DENOMINATOR
      : 0n;
    const swapInputAmountNative = amountIn - platformFeeAmountNative;
    if (swapInputAmountNative <= 0n) {
      return staleCachedQuote;
    }

    const gasPriceDecimals = await getDe1GasPriceDecimals();
    const search = new URLSearchParams({
      inTokenAddress: toDe1TokenAddress(srcToken),
      outTokenAddress: toDe1TokenAddress(destToken),
      amountDecimals: swapInputAmountNative.toString(),
      gasPriceDecimals: gasPriceDecimals.toString(),
      slippage: String(slippageBpsToPercent(params.slippageBps)),
    });

    const payload = await fetchDe1Json<De1QuoteResponse>(
      `${DE1_CHAIN_SLUG}/quote?${search.toString()}`,
      QUOTE_TIMEOUT_MS,
      `De1 quote timed out after ${QUOTE_TIMEOUT_MS}ms`,
    );

    if (payload.code !== 200 || !payload.data) {
      throw new Error(payload.msg || payload.message || "De1 quote request failed");
    }

    const mappedQuote = mapDe1Quote({
      payload: payload.data,
      srcToken,
      destToken,
      amountIn,
      swapInputAmountNative,
      srcDecimals: getTokenDecimalsByAddress(srcToken),
      destDecimals: getTokenDecimalsByAddress(destToken),
      slippageBps: params.slippageBps,
      gasPriceDecimals,
      shouldCollectExecutorFee,
      feeBps: feeState.feeBps,
      treasury: feeState.treasury,
      platformFeeAmountNative,
    });
    if (!mappedQuote) {
      return staleCachedQuote;
    }

    de1QuoteCache.set(cacheKey, {
      quote: mappedQuote,
      fetchedAt: Date.now(),
    });
    return mappedQuote;
  } catch (error) {
    if (staleCachedQuote) {
      console.warn(
        "[De1] quote failed, using cached quote:",
        readErrorMessage(error),
      );
      return staleCachedQuote;
    }

    console.warn("[De1] quote failed:", readErrorMessage(error));
    return null;
  }
}

export const buildDe1SwapTransaction = async (params: {
  quote: De1Quote;
  userAddress: Address;
}) => {
  const userAddress = getAddress(params.userAddress);
  if (params.quote.de1.expiresAt <= Date.now()) {
    throw new Error("De1 quote expired. Refresh quotes and try again.");
  }

  const srcToken = getAddress(params.quote.inputToken);
  const destToken = getAddress(params.quote.outputToken);
  const amountIn = toBigIntQuantity(
    params.quote.inputAmountNative,
    toBigIntQuantity(params.quote.swapInputAmountNative, 0n),
  );
  const swapInputAmountNative = toBigIntQuantity(
    params.quote.swapInputAmountNative,
    amountIn,
  );
  if (amountIn <= 0n || swapInputAmountNative <= 0n) {
    throw new Error("De1 swap amount is empty");
  }

  const adapterAddress = getDe1AdapterAddress();
  const executorAddress = getDe1ExecutorAddress();
  const useFeePath = params.quote.feeMode === TOWER_SWAP_FEE_MODE;
  const useAdapterPath = Boolean(useFeePath && adapterAddress && executorAddress);
  const minOutNativeRaw = toBigIntQuantity(params.quote.minOutNative, 0n);
  const minOutNative =
    minOutNativeRaw > 0n ? minOutNativeRaw : useAdapterPath ? 1n : 0n;
  const nativeInput = isNativeToken(srcToken);
  const approvalSpender = useAdapterPath
    ? executorAddress
    : getAddress(params.quote.de1.exchange || DE1_EXCHANGE_ADDRESS);
  const approvalAmount = useAdapterPath ? amountIn : swapInputAmountNative;

  if (useFeePath && !useAdapterPath) {
    throw new Error(
      "De1 adapter is not configured for TowerSwapExecutor fees. Set NEXT_PUBLIC_DE1_ADAPTER_MAINNET_ADDRESS after deploying the adapter.",
    );
  }

  if (useAdapterPath && adapterAddress) {
    const publicClient = createDe1PublicClient();
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
        "De1 adapter is not allowlisted on TowerSwapExecutor. Run deploy:de1-adapter:mainnet or configure:tower-swap-executor:mainnet after deploying the adapter.",
      );
    }
  }

  const gasPriceDecimals = toBigIntQuantity(
    params.quote.de1.gasPriceDecimals,
    0n,
  );
  if (gasPriceDecimals <= 0n) {
    throw new Error("De1 gas price is missing from the quote");
  }

  const search = new URLSearchParams({
    inTokenAddress: toDe1TokenAddress(srcToken),
    outTokenAddress: toDe1TokenAddress(destToken),
    amountDecimals: swapInputAmountNative.toString(),
    gasPriceDecimals: gasPriceDecimals.toString(),
    slippage: String(slippageBpsToPercent(params.quote.slippage)),
    account: useAdapterPath ? executorAddress : userAddress,
  });
  if (useAdapterPath && adapterAddress) {
    search.set("sender", adapterAddress);
  }

  const referrer = process.env.DE1_REFERRER?.trim();
  const referrerFee = process.env.DE1_REFERRER_FEE?.trim();
  if (referrer && isAddress(referrer)) {
    search.set("referrer", referrer);
    if (referrerFee && !useAdapterPath) {
      search.set("referrerFee", referrerFee);
    }
  }

  const payload = await fetchDe1Json<De1QuoteResponse>(
    `${DE1_CHAIN_SLUG}/swap?${search.toString()}`,
    BUILD_TIMEOUT_MS,
    `De1 swap timed out after ${BUILD_TIMEOUT_MS}ms`,
  );

  if (payload.code !== 200 || !payload.data) {
    throw new Error(payload.msg || payload.message || "De1 swap request failed");
  }

  const to = isAddress(asString(payload.data.to))
    ? getAddress(asString(payload.data.to))
    : isAddress(asString(payload.data.exchange))
      ? getAddress(asString(payload.data.exchange))
      : null;
  const data = asString(payload.data.data);
  if (!to || !data.startsWith("0x")) {
    throw new Error("De1 swap did not return transaction calldata");
  }

  if (useAdapterPath && to.toLowerCase() !== DE1_EXCHANGE_ADDRESS.toLowerCase()) {
    throw new Error(
      `De1 swap target ${to} is not the De1 exchange. Do not allowlist it on TowerSwapExecutor.`,
    );
  }

  const swapValue = toBigIntQuantity(payload.data.value, 0n);
  if (useAdapterPath && swapValue > 0n) {
    throw new Error("De1 native-value swaps cannot collect Tower executor fees");
  }

  const estimatedGas = toBigIntQuantity(
    payload.data.estimatedGas,
    toBigIntQuantity(params.quote.gasEstimate, DEFAULT_QUOTE_GAS_LIMIT),
  );
  let needsApproval = !nativeInput;

  if (!nativeInput) {
    try {
      const publicClient = createDe1PublicClient();
      const allowance = (await publicClient.readContract({
        address: srcToken,
        abi: ERC20_ALLOWANCE_ABI,
        functionName: "allowance",
        args: [userAddress, approvalSpender],
      })) as bigint;
      needsApproval = allowance < approvalAmount;
    } catch (error) {
      console.warn(
        "[De1] allowance check failed, requesting approval:",
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
        label: useAdapterPath ? "Executor approval" : "De1 approval",
        spender: approvalSpender,
        amountRaw: approvalAmount.toString(),
        token: srcToken,
      }
    : null;

  const adapterCalldata =
    useAdapterPath && adapterAddress
      ? encodeFunctionData({
          abi: DE1_ADAPTER_ABI,
          functionName: "swapExactInput",
          args: [
            srcToken,
            destToken,
            swapInputAmountNative,
            minOutNative,
            executorAddress,
            to,
            data as Hex,
          ],
        })
      : null;

  const swapData =
    adapterCalldata && adapterAddress
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
      : (data as Hex);

  const feeRecipient = params.quote.feeRecipient
    ? getAddress(params.quote.feeRecipient)
    : DE1_SWAP_FEE_RECIPIENT;

  return {
    approval,
    swap: {
      to: useAdapterPath ? executorAddress : to,
      data: swapData,
      value: toHexQuantity(useAdapterPath ? 0n : swapValue),
      from: userAddress,
      gasLimit: toHexQuantity(
        useAdapterPath
          ? EXECUTOR_GAS_LIMIT
          : (estimatedGas * 150n) / 100n,
      ),
      chainId: DE1_CHAIN_ID,
      expectedUserOutput:
        asString(payload.data.outAmount) ||
        params.quote.outputAmountNative ||
        params.quote.minOutNative,
      feeMode: useAdapterPath ? TOWER_SWAP_FEE_MODE : "none",
      feeBps: useAdapterPath ? params.quote.feeBps : undefined,
      feeRecipient: useAdapterPath ? feeRecipient : undefined,
      feeToken: useAdapterPath ? srcToken : undefined,
      platformFeeAmount: useAdapterPath
        ? params.quote.platformFeeAmountNative
        : undefined,
      executorAddress: useAdapterPath ? executorAddress : undefined,
      label: useAdapterPath ? "De1 executor swap" : "De1 swap",
    } satisfies De1SwapTransaction,
  };
};
