import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  isAddress,
  maxUint256,
  type Hex,
} from "viem";
import { TOKEN_CONTRACTS, TOKEN_DECIMALS } from "@/lib/arcNetwork";

export const SWAP_API_ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  UNSUPPORTED_TOKEN: "UNSUPPORTED_TOKEN",
  NO_ROUTE_FOUND: "NO_ROUTE_FOUND",
  QUOTE_EXPIRED: "QUOTE_EXPIRED",
  QUOTE_STALE: "QUOTE_STALE",
  SWAPS_DISABLED: "SWAPS_DISABLED",
  BUILD_TX_FAILED: "BUILD_TX_FAILED",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  RATE_LIMITED: "RATE_LIMITED",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type SwapApiErrorCode =
  (typeof SWAP_API_ERROR_CODES)[keyof typeof SWAP_API_ERROR_CODES];

const DEFAULT_QUOTE_TTL_SECONDS = 120;
const DEFAULT_SLIPPAGE_BPS = 50;
const MIN_SLIPPAGE_BPS = 1;
const MAX_SLIPPAGE_BPS = 5_000;
const MAX_UINT160 = (1n << 160n) - 1n;
const NORMALIZED_DECIMALS = 18;

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

const PERMIT2_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
] as const;

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const scaleAmount = (amount: bigint, fromDecimals: number, toDecimals: number) => {
  if (fromDecimals === toDecimals) {
    return amount;
  }

  return fromDecimals < toDecimals
    ? amount * 10n ** BigInt(toDecimals - fromDecimals)
    : amount / 10n ** BigInt(fromDecimals - toDecimals);
};

export const resolveSlippageBps = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SLIPPAGE_BPS;
  }

  // UI percent values are 0.5–5. API callers typically send basis points.
  const asBps = parsed <= 5 ? Math.round(parsed * 100) : Math.round(parsed);
  return Math.min(MAX_SLIPPAGE_BPS, Math.max(MIN_SLIPPAGE_BPS, asBps));
};

export const getSwapQuoteTtlSeconds = () => {
  const parsed = Number(process.env.SWAP_QUOTE_TTL_SECONDS);
  if (!Number.isFinite(parsed) || parsed < 5 || parsed > 600) {
    return DEFAULT_QUOTE_TTL_SECONDS;
  }

  return Math.round(parsed);
};

export const getTokenDecimalsByAddress = (address: string) => {
  const normalized = address.toLowerCase();

  for (const [symbol, contractAddress] of Object.entries(TOKEN_CONTRACTS)) {
    if (contractAddress.toLowerCase() === normalized) {
      return TOKEN_DECIMALS[symbol] ?? NORMALIZED_DECIMALS;
    }
  }

  return NORMALIZED_DECIMALS;
};

const toRawAmount = (
  nativeValue: unknown,
  normalizedValue: unknown,
  decimals: number,
) => {
  const native = asString(nativeValue);
  if (native) {
    return native;
  }

  const normalized = asString(normalizedValue);
  if (!normalized) {
    return null;
  }

  try {
    return scaleAmount(BigInt(normalized), NORMALIZED_DECIMALS, decimals).toString();
  } catch {
    return null;
  }
};

const checksumAddress = (value: string | null | undefined) => {
  if (!value || !isAddress(value)) {
    return null;
  }

  return getAddress(value);
};

export const inferSwapApiErrorCode = (
  payload: JsonRecord,
  status?: number,
): SwapApiErrorCode => {
  const error = String(payload.error ?? payload.message ?? "").toLowerCase();

  if (status === 401 || error.includes("unauthorized") || error.includes("api key")) {
    return SWAP_API_ERROR_CODES.UNAUTHORIZED;
  }
  if (status === 403 || error.includes("forbidden") || error.includes("scope")) {
    return SWAP_API_ERROR_CODES.FORBIDDEN;
  }
  if (status === 429 || error.includes("rate limit")) {
    return SWAP_API_ERROR_CODES.RATE_LIMITED;
  }
  if (
    status === 405 ||
    (error.includes("method") && error.includes("not allowed"))
  ) {
    return SWAP_API_ERROR_CODES.METHOD_NOT_ALLOWED;
  }
  if (error.includes("expired")) {
    return SWAP_API_ERROR_CODES.QUOTE_EXPIRED;
  }
  if (error.includes("stale") || error.includes("requote")) {
    return SWAP_API_ERROR_CODES.QUOTE_STALE;
  }
  if (error.includes("no valid route") || error.includes("no route")) {
    return SWAP_API_ERROR_CODES.NO_ROUTE_FOUND;
  }
  if (error.includes("unsupported") || error.includes("invalid inputtoken")) {
    return SWAP_API_ERROR_CODES.UNSUPPORTED_TOKEN;
  }
  if (error.includes("disabled")) {
    return SWAP_API_ERROR_CODES.SWAPS_DISABLED;
  }
  if (
    error.includes("missing") ||
    error.includes("invalid json") ||
    error.includes("invalid request")
  ) {
    return SWAP_API_ERROR_CODES.INVALID_REQUEST;
  }
  if (error.includes("build") && error.includes("transaction")) {
    return SWAP_API_ERROR_CODES.BUILD_TX_FAILED;
  }
  if (status && status >= 400 && status < 500) {
    return SWAP_API_ERROR_CODES.INVALID_REQUEST;
  }

  return SWAP_API_ERROR_CODES.INTERNAL_ERROR;
};

export const withSwapApiErrorCode = (
  payload: unknown,
  status?: number,
): JsonRecord => {
  if (!isRecord(payload)) {
    return {
      success: false,
      error: "Request failed",
      code: SWAP_API_ERROR_CODES.INTERNAL_ERROR,
    };
  }

  const isError =
    payload.success === false || (typeof status === "number" && status >= 400);
  if (!isError) {
    return payload;
  }

  if (typeof payload.code === "string" && payload.code) {
    return {
      ...payload,
      success: false,
    };
  }

  return {
    ...payload,
    success: false,
    code: inferSwapApiErrorCode(payload, status),
  };
};

const enrichQuoteRecord = (quote: JsonRecord, quotedAtMs: number, ttlSeconds: number) => {
  const inputToken = asString(quote.inputToken) ?? "";
  const outputToken = asString(quote.outputToken) ?? "";
  const inputTokenDecimals = getTokenDecimalsByAddress(inputToken);
  const outputTokenDecimals = getTokenDecimalsByAddress(outputToken);
  const inputAmountRaw = toRawAmount(
    quote.inputAmountNative,
    quote.inputAmount,
    inputTokenDecimals,
  );
  const swapInputAmountRaw = toRawAmount(
    quote.swapInputAmountNative,
    quote.swapInputAmount,
    inputTokenDecimals,
  );
  const outputAmountRaw = toRawAmount(
    quote.outputAmountNative,
    quote.outputAmount,
    outputTokenDecimals,
  );
  const minOutRaw = toRawAmount(quote.minOutNative, quote.minOut, outputTokenDecimals);
  const platformFeeAmountRaw = toRawAmount(
    quote.platformFeeAmountNative,
    quote.platformFeeAmount,
    inputTokenDecimals,
  );

  return {
    ...quote,
    inputTokenDecimals,
    outputTokenDecimals,
    amountScale: "normalized_1e18",
    requestAmountUnit: "token_decimals",
    inputAmountRaw,
    swapInputAmountRaw,
    outputAmountRaw,
    minOutRaw,
    platformFeeAmountRaw,
    quotedAt: new Date(quotedAtMs).toISOString(),
    expiresAt: new Date(quotedAtMs + ttlSeconds * 1000).toISOString(),
    validForSeconds: ttlSeconds,
  };
};

export const enrichPublicSwapQuote = (quote: unknown) => {
  if (!isRecord(quote)) {
    return quote;
  }

  const quotedAtMs = Date.now();
  const ttlSeconds = getSwapQuoteTtlSeconds();
  const routeOptions = Array.isArray(quote.routeOptions)
    ? quote.routeOptions.map((option) => {
        if (!isRecord(option)) {
          return option;
        }

        return {
          ...option,
          quote: isRecord(option.quote)
            ? enrichQuoteRecord(option.quote, quotedAtMs, ttlSeconds)
            : option.quote,
        };
      })
    : quote.routeOptions;

  return {
    ...enrichQuoteRecord(quote, quotedAtMs, ttlSeconds),
    routeOptions,
  };
};

const toHexData = (data: string): Hex | null => {
  const trimmed = data.trim();
  if (!trimmed) {
    return null;
  }

  const hex = (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as Hex;
  if (!/^0x[0-9a-fA-F]+$/.test(hex) || hex.length < 10) {
    return null;
  }

  return hex;
};

const decodeApprovalCalldata = (data: string) => {
  const hex = toHexData(data);
  if (!hex) {
    return null;
  }

  try {
    const decoded = decodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      data: hex,
    });

    return {
      token: null as string | null,
      spender: decoded.args[0],
      amountRaw: decoded.args[1].toString(),
    };
  } catch {
    // Not an ERC-20 approve(address,uint256) call.
  }

  try {
    const decoded = decodeFunctionData({
      abi: PERMIT2_APPROVE_ABI,
      data: hex,
    });

    return {
      token: decoded.args[0],
      spender: decoded.args[1],
      amountRaw: decoded.args[2].toString(),
    };
  } catch {
    return null;
  }
};

export const enrichPublicApproval = (approval: unknown) => {
  if (!isRecord(approval)) {
    return approval;
  }

  const decoded = asString(approval.data)
    ? decodeApprovalCalldata(approval.data as string)
    : null;
  // Prefer decoded calldata over JSON so wallets cannot be shown a spender/amount
  // that disagrees with the transaction they will actually sign.
  const token =
    checksumAddress(decoded?.token ?? null) ??
    checksumAddress(asString(approval.to));
  const spender =
    checksumAddress(decoded?.spender ?? null) ??
    checksumAddress(asString(approval.spender));
  const amountRaw = decoded?.amountRaw ?? asString(approval.amountRaw) ?? null;

  return {
    ...approval,
    token,
    spender,
    amountRaw,
  };
};

export const enrichPublicBuildTxData = (data: unknown) => {
  if (!isRecord(data)) {
    return data;
  }

  const approval = data.approval;
  const enrichedApproval = Array.isArray(approval)
    ? approval.map(enrichPublicApproval)
    : enrichPublicApproval(approval);

  return {
    ...data,
    approval: enrichedApproval,
  };
};

const parseExactAmount = (value: string | null) => {
  if (!value) {
    return null;
  }

  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
};

export const boundApprovalToExactAmount = (
  approval: unknown,
  exactAmountRaw: string | null,
) => {
  if (!isRecord(approval)) {
    return approval;
  }

  const exact = parseExactAmount(exactAmountRaw);
  const data = asString(approval.data);
  if (!exact || !data) {
    return approval;
  }

  const hex = toHexData(data);
  if (!hex) {
    return approval;
  }

  try {
    const decoded = decodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      data: hex,
    });
    const spender = decoded.args[0];
    const current = decoded.args[1];
    if (current !== maxUint256) {
      return {
        ...approval,
        spender,
        amountRaw: current.toString(),
      };
    }

    return {
      ...approval,
      data: encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [spender, exact],
      }),
      spender,
      amountRaw: exact.toString(),
    };
  } catch {
    // Not an ERC-20 approve(address,uint256) call.
  }

  try {
    const decoded = decodeFunctionData({
      abi: PERMIT2_APPROVE_ABI,
      data: hex,
    });
    const token = decoded.args[0];
    const spender = decoded.args[1];
    const current = decoded.args[2];
    const expiration = decoded.args[3];
    if (current !== MAX_UINT160) {
      return {
        ...approval,
        token,
        spender,
        amountRaw: current.toString(),
      };
    }

    const capped = exact > MAX_UINT160 ? MAX_UINT160 : exact;
    return {
      ...approval,
      data: encodeFunctionData({
        abi: PERMIT2_APPROVE_ABI,
        functionName: "approve",
        args: [token, spender, capped, expiration],
      }),
      token,
      spender,
      amountRaw: capped.toString(),
    };
  } catch {
    return approval;
  }
};

export const boundBuildTxApprovals = (
  data: unknown,
  exactAmountRaw: string | null,
) => {
  if (!isRecord(data)) {
    return data;
  }

  const approval = data.approval;
  const boundedApproval = Array.isArray(approval)
    ? approval.map((item) => boundApprovalToExactAmount(item, exactAmountRaw))
    : boundApprovalToExactAmount(approval, exactAmountRaw);

  return enrichPublicBuildTxData({
    ...data,
    approval: boundedApproval,
  });
};

export const getExpiredQuoteError = (quote: unknown) => {
  if (!isRecord(quote)) {
    return null;
  }

  const expiresAt = asString(quote.expiresAt);
  if (!expiresAt) {
    return {
      success: false as const,
      error: "Quote is missing expiry. Request a new quote before building the transaction.",
      code: SWAP_API_ERROR_CODES.QUOTE_EXPIRED,
    };
  }

  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) {
    return {
      success: false as const,
      error: "Quote expiry is invalid. Request a new quote before building the transaction.",
      code: SWAP_API_ERROR_CODES.QUOTE_EXPIRED,
    };
  }

  if (Date.now() <= expiresMs) {
    return null;
  }

  return {
    success: false as const,
    error: "Quote expired. Request a new quote before building the transaction.",
    code: SWAP_API_ERROR_CODES.QUOTE_EXPIRED,
  };
};
