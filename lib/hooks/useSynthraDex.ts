"use client";

import { useCallback, useMemo, useState } from "react";
import {
  buildSynthraApprovalTransaction,
  buildSynthraExactInputTransaction,
  createSynthraPublicClient,
  getBestSynthraQuote,
  getSynthraDexInfo,
  type SynthraQuote,
  type SynthraTransaction,
} from "@/lib/synthraDex";

interface SynthraDexState {
  quote: SynthraQuote | null;
  isLoading: boolean;
  error: string | null;
}

export function useSynthraDex(rpcUrl?: string) {
  const client = useMemo(() => createSynthraPublicClient(rpcUrl), [rpcUrl]);
  const [state, setState] = useState<SynthraDexState>({
    quote: null,
    isLoading: false,
    error: null,
  });

  const getQuote = useCallback(
    async (
      tokenIn: string,
      tokenOut: string,
      amountIn: string,
    ): Promise<SynthraQuote | null> => {
      if (!amountIn || BigInt(amountIn) <= 0n) {
        setState({ quote: null, isLoading: false, error: null });
        return null;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const quote = await getBestSynthraQuote(client, tokenIn, tokenOut, amountIn);

        setState({
          quote,
          isLoading: false,
          error: quote ? null : "No valid Synthra route found",
        });

        return quote;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to get Synthra quote";
        setState({ quote: null, isLoading: false, error: message });
        return null;
      }
    },
    [client],
  );

  const buildSwapTransaction = useCallback(
    (quote: SynthraQuote, recipient: string, slippageBps = 50): SynthraTransaction =>
      buildSynthraExactInputTransaction({
        quote,
        recipient,
        slippageBps,
      }),
    [],
  );

  const buildApprovalTransaction = useCallback(
    (tokenAddress: string, amount: string): SynthraTransaction =>
      buildSynthraApprovalTransaction({
        tokenAddress,
        amount,
      }),
    [],
  );

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    dexInfo: getSynthraDexInfo(),
    getQuote,
    buildSwapTransaction,
    buildApprovalTransaction,
    clearError,
  };
}
