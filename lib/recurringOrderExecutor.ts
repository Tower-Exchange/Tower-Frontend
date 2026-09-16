"use client";

import {
  decodeFunctionResult,
  encodeFunctionData,
  keccak256,
  maxUint256,
  parseUnits,
  stringToBytes,
} from "viem";
import {
  ERC20_TOKENS,
  NATIVE_TOKENS,
  TOKEN_CONTRACTS,
  TOKEN_DECIMALS,
  getArcNetworkHex,
  getArcNetworkLabel,
  normalizeArcChainHex,
} from "@/lib/arcNetwork";
import { ensureWalletOnArcNetwork } from "@/lib/arcWalletNetwork";
import { readStoredBridgeNetworkMode } from "@/lib/bridgeNetworks";
import { getBrowserWalletChainId, getBrowserWalletProvider } from "@/lib/browser-wallet";

export const RECURRING_ORDER_EXECUTOR_ADDRESS =
  process.env.NEXT_PUBLIC_RECURRING_ORDER_EXECUTOR_ADDRESS || "";

const recurringOrderExecutorAbi = [
  {
    type: "function",
    name: "authorizeOrder",
    stateMutability: "nonpayable",
    inputs: [
      { name: "orderId", type: "bytes32" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "maxAmountIn", type: "uint256" },
      { name: "minInterval", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validUntil", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelOrder",
    stateMutability: "nonpayable",
    inputs: [{ name: "orderId", type: "bytes32" }],
    outputs: [],
  },
] as const;

const erc20Abi = [
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

const frequencyToMinIntervalSeconds = (frequency: string) => {
  switch (frequency.toLowerCase()) {
    case "hourly":
      return 60 * 60;
    case "daily":
      return 24 * 60 * 60;
    case "weekly":
      return 7 * 24 * 60 * 60;
    case "bi-weekly":
      return 14 * 24 * 60 * 60;
    case "monthly":
    case "month":
      return 28 * 24 * 60 * 60;
    default:
      return 7 * 24 * 60 * 60;
  }
};

const toUnixSeconds = (date?: string | null) => {
  if (!date) {
    return 0n;
  }

  const time = new Date(date).getTime();
  return Number.isNaN(time) ? 0n : BigInt(Math.floor(time / 1000));
};

export const getRecurringOrderKey = (orderId: string) =>
  keccak256(stringToBytes(orderId));

const getTokenAllowance = async (
  provider: ReturnType<typeof getBrowserWalletProvider>,
  tokenAddress: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`
) => {
  const result = await provider.request({
    method: "eth_call",
    params: [
      {
        to: tokenAddress,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "allowance",
          args: [owner, spender],
        }),
      },
      "latest",
    ],
  });

  return decodeFunctionResult({
    abi: erc20Abi,
    functionName: "allowance",
    data: result as `0x${string}`,
  });
};

export const isRecurringOrderTokenSupported = (symbol: string) =>
  Boolean(TOKEN_CONTRACTS[symbol]) &&
  (ERC20_TOKENS.includes(symbol) || NATIVE_TOKENS.includes(symbol));

type AuthorizeRecurringOrderParams = {
  orderId: string;
  walletAddress: string;
  sourceToken: string;
  targetToken: string;
  amount: number;
  frequency: string;
  startDate?: string | null;
  endDate?: string | null;
};

export const authorizeRecurringOrderOnchain = async ({
  orderId,
  walletAddress,
  sourceToken,
  targetToken,
  amount,
  frequency,
  startDate,
  endDate,
}: AuthorizeRecurringOrderParams) => {
  if (!RECURRING_ORDER_EXECUTOR_ADDRESS) {
    throw new Error("Recurring order executor address is not configured.");
  }

  if (!isRecurringOrderTokenSupported(sourceToken)) {
    throw new Error(
      `${sourceToken} is not supported for automatic recurring execution yet.`
    );
  }

  const sourceTokenAddress = TOKEN_CONTRACTS[sourceToken] as `0x${string}`;
  const targetTokenAddress = TOKEN_CONTRACTS[targetToken] as `0x${string}` | undefined;

  if (!targetTokenAddress) {
    throw new Error(`${targetToken} is not configured for recurring execution.`);
  }

  const provider = getBrowserWalletProvider();
  const mode = readStoredBridgeNetworkMode();
  await ensureWalletOnArcNetwork(mode);
  const currentChainId = await getBrowserWalletChainId(provider);

  if (
    normalizeArcChainHex(currentChainId) !==
    normalizeArcChainHex(getArcNetworkHex(mode))
  ) {
    throw new Error(
      `Please switch to ${getArcNetworkLabel(mode)} before authorizing this recurring order.`,
    );
  }

  const decimals = TOKEN_DECIMALS[sourceToken] ?? 18;
  const maxAmountIn = parseUnits(String(amount), decimals);
  const orderKey = getRecurringOrderKey(orderId);
  const minInterval = BigInt(frequencyToMinIntervalSeconds(frequency));
  const validAfter = toUnixSeconds(startDate);
  const validUntil = toUnixSeconds(endDate);

  const executorAddress = RECURRING_ORDER_EXECUTOR_ADDRESS as `0x${string}`;
  const currentAllowance = await getTokenAllowance(
    provider,
    sourceTokenAddress,
    walletAddress as `0x${string}`,
    executorAddress
  );
  const approvalHash =
    currentAllowance < maxAmountIn
      ? await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: walletAddress,
              to: sourceTokenAddress,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "approve",
                args: [executorAddress, maxUint256],
              }),
              value: "0x0",
            },
          ],
        })
      : null;

  const authorizationHash = await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: walletAddress,
        to: executorAddress,
        data: encodeFunctionData({
          abi: recurringOrderExecutorAbi,
          functionName: "authorizeOrder",
          args: [
            orderKey,
            sourceTokenAddress,
            targetTokenAddress,
            maxAmountIn,
            minInterval,
            validAfter,
            validUntil,
          ],
        }),
        value: "0x0",
      },
    ],
  });

  return {
    orderKey,
    approvalHash: approvalHash ? String(approvalHash) : null,
    authorizationHash: String(authorizationHash),
    executorAddress: RECURRING_ORDER_EXECUTOR_ADDRESS,
  };
};

type CancelRecurringOrderParams = {
  orderId: string;
  walletAddress: string;
  sourceToken: string;
  onchainOrderKey?: string | null;
};

export const cancelRecurringOrderOnchain = async ({
  orderId,
  walletAddress,
  sourceToken,
  onchainOrderKey,
}: CancelRecurringOrderParams) => {
  if (!RECURRING_ORDER_EXECUTOR_ADDRESS) {
    throw new Error("Recurring order executor address is not configured.");
  }

  const sourceTokenAddress = TOKEN_CONTRACTS[sourceToken] as `0x${string}` | undefined;
  if (!sourceTokenAddress) {
    throw new Error(`${sourceToken} is not configured for recurring execution.`);
  }

  const provider = getBrowserWalletProvider();
  const mode = readStoredBridgeNetworkMode();
  await ensureWalletOnArcNetwork(mode);
  const currentChainId = await getBrowserWalletChainId(provider);

  if (
    normalizeArcChainHex(currentChainId) !==
    normalizeArcChainHex(getArcNetworkHex(mode))
  ) {
    throw new Error(
      `Please switch to ${getArcNetworkLabel(mode)} before cancelling this recurring order.`,
    );
  }

  const orderKey = (onchainOrderKey || getRecurringOrderKey(orderId)) as `0x${string}`;

  const cancelHash = await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: walletAddress,
        to: RECURRING_ORDER_EXECUTOR_ADDRESS,
        data: encodeFunctionData({
          abi: recurringOrderExecutorAbi,
          functionName: "cancelOrder",
          args: [orderKey],
        }),
        value: "0x0",
      },
    ],
  });

  const revokeApprovalHash = await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: walletAddress,
        to: sourceTokenAddress,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [RECURRING_ORDER_EXECUTOR_ADDRESS as `0x${string}`, 0n],
        }),
        value: "0x0",
      },
    ],
  });

  return {
    cancelHash: String(cancelHash),
    revokeApprovalHash: String(revokeApprovalHash),
  };
};
