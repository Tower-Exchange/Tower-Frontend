import { useState, useCallback } from 'react';

export interface SwapQuote {
  inputToken: string;
  outputToken: string;
  inputAmount: string;
  swapInputAmount?: string; // Net amount after Tower platform fee, normalized to 18 decimals
  outputAmount: string;
  minOut: string;
  inputTokenDecimals?: number;
  outputTokenDecimals?: number;
  amountScale?: string;
  requestAmountUnit?: string;
  inputAmountRaw?: string;
  swapInputAmountRaw?: string;
  outputAmountRaw?: string;
  minOutRaw?: string;
  platformFeeAmountRaw?: string;
  quotedAt?: string;
  expiresAt?: string;
  validForSeconds?: number;
  priceImpact: string | number;
  gasEstimate?: string;
  slippage?: number; // in basis points
  exec_price?: number;
  feeBps?: number;
  feeMode?: 'tower-swap-executor' | 'none';
  platformFeeAmount?: string; // Platform fee in input token, normalized to 18 decimals
  platformFeeAmountNative?: string;
  inputAmountNative?: string;
  swapInputAmountNative?: string;
  outputAmountNative?: string;
  minOutNative?: string;
  feeRecipient?: string;
  route: {
    type: 'single' | 'multi' | 'split';
    rawPath?: string;
    totalFee?: number; // in basis points
    estimatedOutput?: string;
    hops: Array<{
      dexId: string; // DEX identifier from backend
      dex?: string;
      dexName?: string; // Router name (e.g., "XyloNet Adapter", "Synthra")
      dexRouter?: string; // Router contract address
      path: string[];
      feeTier?: number;
      feeTiers?: number[];
      amountIn: string;
      amountOut: string;
      priceImpact: string | number;
      liquidity?: string; // Liquidity available in the hop
    }>;
  };
  routeOptions?: SwapRouteOption[];
}

export interface SwapRouteOption {
  dexId: string;
  dexName: string;
  outputAmount: string;
  routeType: 'single' | 'multi' | 'split';
  gasEstimate?: string;
  quote: SwapQuote;
  isFallback?: boolean;
}

export interface SwapTransaction {
  to: string;
  data: string;
  value: string;
  from: string;
  gasLimit: string;
  chainId: number;
  platformFeeAmount?: string; // Platform fee in input token native decimals
  expectedUserOutput?: string; // Expected output after fee deduction
  expectedFeeCollectorOutput?: string; // Deprecated: legacy FeeCollector flow only
  feeRecipient?: string;
  feeBps?: number;
  feeMode?: 'tower-swap-executor' | 'none';
  feeToken?: string;
  executorAddress?: string;
}

export interface ApprovalTransaction {
  to: string;
  data: string;
  from: string;
  gasLimit: string;
  value?: string;
  label?: string;
  token?: string;
  spender?: string;
  amountRaw?: string;
}

interface UseTowerSwapOptions {
  /** @deprecated Quotes and swap txs are routed through the Next.js swap API. */
  backendUrl?: string;
}

const SWAP_API_BASE_URL = '/api/swap';

/**
 * Custom hook for interacting with Tower Exchange DEX Aggregator backend
 * Handles quote fetching, transaction building, and approvals
 */
export function useTowerSwap(_options: UseTowerSwapOptions = {}) {
  const swapApiBaseUrl = SWAP_API_BASE_URL;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch swap quote from backend
   */
  const getQuote = useCallback(
    async (
      inputToken: string,
      outputToken: string,
      inputAmount: string,
      slippageTolerance: number = 50, // 0.5% default
      dexId?: string
    ): Promise<SwapQuote | null> => {
      setIsLoading(true);
      setError(null);

      try {
        console.debug('[useTowerSwap] quote request', {
          swapApiBaseUrl,
          inputToken,
          outputToken,
          inputAmount,
          slippageTolerance,
          dexId,
        });

        const response = await fetch(`${swapApiBaseUrl}/quote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputToken,
            outputToken,
            inputAmount,
            slippageTolerance,
            dexId,
          }),
        });

        if (!response.ok) {
          let errorMessage = `Failed to get quote: ${response.statusText}`;

          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch {
            const errorText = await response.text().catch(() => '');
            if (errorText) {
              errorMessage = errorText;
            }
          }

          throw new Error(errorMessage);
        }

        const responseData = await response.json();
        // Backend wraps response in {success, data, timestamp}
        const quote: SwapQuote = responseData.data || responseData;
        console.debug('[useTowerSwap] quote response received', {
          inputToken,
          outputToken,
          inputAmount,
          outputAmount: quote.outputAmount,
          routeOptionsCount: quote.routeOptions?.length ?? 0,
        });
        return quote;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to fetch quote';
        setError(errorMessage);
        console.error('Quote fetch error:', err);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [swapApiBaseUrl]
  );

  /**
   * Build swap transaction from quote (returns both approval + swap if needed)
   */
  const buildSwapTransaction = useCallback(
    async (
      quote: SwapQuote,
      userAddress: string,
      referrer?: string,
      walletBalance?: string
    ): Promise<{ approval?: ApprovalTransaction | ApprovalTransaction[] | null; swap: SwapTransaction } | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${swapApiBaseUrl}/build-tx`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            quote,
            userAddress,
            referrer,
            walletBalance,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || `Failed to build transaction: ${response.statusText}`
          );
        }

        const responseData = await response.json();
        // Backend returns { success, data: { approval?, swap }, timestamp }
        const transactions = responseData.data || { approval: null, swap: responseData };
        return {
          approval: transactions.approval || null,
          swap: transactions.swap,
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to build transaction';
        setError(errorMessage);
        console.error('Build transaction error:', err);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [swapApiBaseUrl]
  );

  /**
   * Build approval transaction for a token
   */
  const buildApprovalTransaction = useCallback(
    async (
      tokenAddress: string,
      spenderAddress: string,
      amount: string,
      userAddress: string
    ): Promise<ApprovalTransaction | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${swapApiBaseUrl}/approval`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tokenAddress,
            spenderAddress,
            amount,
            userAddress,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || `Failed to build approval: ${response.statusText}`
          );
        }

        const tx: ApprovalTransaction = await response.json();
        return tx;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to build approval';
        setError(errorMessage);
        console.error('Build approval error:', err);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [swapApiBaseUrl]
  );

  /**
   * Get available DEXes
   */
  const getAvailableDexes = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${swapApiBaseUrl}/dexes`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch DEXes: ${response.statusText}`);
      }

      const dexes = await response.json();
      return dexes;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch DEXes';
      setError(errorMessage);
      console.error('Fetch DEXes error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [swapApiBaseUrl]);

  /**
   * Get gas prices from backend
   */
  const getGasPrices = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${swapApiBaseUrl}/gas-price`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch gas prices: ${response.statusText}`);
      }

      const gasPrices = await response.json();
      return gasPrices;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch gas prices';
      setError(errorMessage);
      console.error('Fetch gas prices error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [swapApiBaseUrl]);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // Methods
    getQuote,
    buildSwapTransaction,
    buildApprovalTransaction,
    getAvailableDexes,
    getGasPrices,
    clearError,

    // State
    isLoading,
    error,
  };
}

export default useTowerSwap;

