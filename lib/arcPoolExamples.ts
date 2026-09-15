/**
 * Example Arc Pool Integration Guide
 * 
 * This file demonstrates how to integrate Arc pool contracts with your application.
 */
"use client";

import {
  getSwapQuote,
  getPoolBalances,
  prepareSwapTransaction,
  listAvailablePools,
  getPoolInfo,
  TOKEN_CONTRACTS,
} from "@/lib/arcNetwork";
import { useArcPools } from "@/lib/useArcPools";

// ============================================================================
// EXAMPLE 1: Basic Pool Query
// ============================================================================

export async function example_getPoolBalances() {
  // Get balances for USDC/EURC pool
  const poolInfo = getPoolInfo("USDC/EURC");
  
  if (!poolInfo) {
    console.log("Pool not found");
    return;
  }

  const [balance0, balance1] = await getPoolBalances(poolInfo.address);

  console.log("USDC Balance:", balance0);
  console.log("EURC Balance:", balance1);
}

// ============================================================================
// EXAMPLE 2: Get a Swap Quote
// ============================================================================

export async function example_getSwapQuote() {
  // Swap 1000 USDC to EURC using the swap router
  // Note: USDC is at placeholder address since it's native
  const tokenInAddress = TOKEN_CONTRACTS.USDC;
  const tokenOutAddress = TOKEN_CONTRACTS.EURC;
  
  const amountIn = (BigInt(1000) * BigInt(10) ** BigInt(6)).toString(); // 1000 USDC with 6 decimals

  const amountOut = await getSwapQuote(
    tokenInAddress,
    tokenOutAddress,
    amountIn
  );

  console.log("Input: 1000 USDC");
  console.log("Output: " + (BigInt(amountOut) / (BigInt(10) ** BigInt(6))).toString() + " EURC");
}

// ============================================================================
// EXAMPLE 3: Prepare a Swap Transaction (for signing with a connected wallet)
// ============================================================================

export function example_prepareSwap() {
  const amountIn = (BigInt(1000) * BigInt(10) ** BigInt(18)).toString();

  const txData = prepareSwapTransaction(
    0, // USDC
    1, // EURC
    amountIn
  );

  console.log("Transaction ready to sign:");
  console.log({
    to: txData.to,
    data: txData.data,
    value: txData.value,
  });

  // This txData can be passed to the connected wallet's sendTransaction()
  return txData;
}

// ============================================================================
// EXAMPLE 4: React Hook Usage in a Component
// ============================================================================
/* eslint-disable @typescript-eslint/no-unused-vars */

export function ExampleSwapComponent() {
  const {
    poolState,
    swapQuote,
    fetchPoolBalances,
    getQuote,
    prepareSwap,
    listPools,
    routerAddress,
  } = useArcPools();

  // On component mount, fetch available pools
  const pools = listPools();
  console.log("Available pools:", pools);

  // Fetch balances for USDC/EURC
  const handleFetchBalances = async () => {
    const poolInfo = getPoolInfo("USDC/EURC");
    if (poolInfo) {
      await fetchPoolBalances(poolInfo.address);
    }
  };

  // Get a quote
  const handleGetQuote = async () => {
    const poolInfo = getPoolInfo("USDC/EURC");
    if (poolInfo) {
      await getQuote(poolInfo.address);
    }
  };

  // Get balances
  console.log("Pool balances:", poolState);

  // Get quote info including price impact
  console.log("Swap quote:", swapQuote);

  return null;
}
/* eslint-enable @typescript-eslint/no-unused-vars */

// ============================================================================
// EXAMPLE 5: Sign and broadcast with a connected wallet
// ============================================================================

export async function example_executeSwapWithWallet(
  sendTransaction: (tx: { to: string; data: string; value: string }) => Promise<string>
) {
  try {
    const amountIn = (BigInt(1000) * BigInt(10) ** BigInt(18)).toString();

    // 1. Prepare transaction
    const txData = prepareSwapTransaction(
      0, // USDC
      1, // EURC
      amountIn
    );

    // 2. Send with the connected wallet
    const txResponse = await sendTransaction({
      to: txData.to,
      data: txData.data,
      value: txData.value,
    });

    console.log("Transaction sent:", txResponse);

    return txResponse;
  } catch (error) {
    console.error("Swap failed:", error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 6: Helper Function - Convert Between Token Amounts
// ============================================================================

export function convertTokenAmount(
  amount: number,
  decimals: number = 18
): string {
  return (BigInt(Math.floor(amount * 10 ** decimals)) * BigInt(1)).toString();
}

export function convertFromWei(amount: string, decimals: number = 18): number {
  return Number(BigInt(amount)) / 10 ** decimals;
}

// ============================================================================
// EXAMPLE 7: Pool Information Lookup
// ============================================================================

export function example_poolInfo() {
  const poolInfo = getPoolInfo("USDC/EURC");
  if (poolInfo) {
    console.log(`Pool: ${poolInfo.pair}`);
    console.log(`Address: ${poolInfo.address}`);
  }

  // List all pools
  const allPools = listAvailablePools();
  console.log("All available pools:", allPools);
}
