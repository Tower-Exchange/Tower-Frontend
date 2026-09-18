/**
 * AI Agent Service - Handles communication with Tower-Exchange-AI backend
 */

import { userApiFetch } from "./userApi";
import {
  canonicalizeAiWalletAddress,
  ensureAiWalletProof,
} from "./aiWalletProof";
import { ensureWalletSession } from "./walletSessionClient";

export interface AIAgentRequest {
  message: string;
  userid: string;
  session_id: string;
  wallet_address?: string;
  wallet_signature?: string;
  wallet_signature_timestamp?: string;
  solana_wallet_address?: string;
  solanaWalletAddress?: string;
  chain_id?: number;
  enable_wallet_access?: boolean;
  enable_swap_execution?: boolean;
  enable_bridge_execution?: boolean;
  enable_portfolio_analysis?: boolean;
}

export type AIAgentSwapRoute = Record<string, unknown>;

export interface AIAgentBridgeRequest {
  fromChain: string;
  toChain: string;
  amount: string;
  token: string;
  sourceAddress?: string;
  toAddress?: string;
  slippageTolerance?: number;
}

export interface AIAgentApprovalTransaction {
  to: string;
  data: string;
  value?: string;
  from?: string;
  gasLimit?: string;
  chainId?: number;
}

export interface AIAgentResponse {
  reply: string;
  userid: string;
  session_id: string;
  data?: {
    action?: string;
    balances?: Array<{
      token: string;
      address: string;
      balance: string;
      formatted_balance: string;
    }>;
    positions?: Array<{
      token: string;
      amount: string;
      value: string;
      change: string;
    }>;
    pnl?: {
      total: string;
      percentage: number;
      timeframe: string;
    };
    volume?: {
      one_day: string;
      seven_day: string;
      thirty_day: string;
    };
    quote?: {
      inputToken: string;
      outputToken: string;
      inputAmount: string;
      outputAmount: string;
      priceImpact: number;
      minOut: string;
      route: AIAgentSwapRoute;
    };
    swap_execution?: {
      quote: {
        inputToken: string;
        outputToken: string;
        inputAmount: string;
        outputAmount: string;
        priceImpact: number;
        minOut: string;
        route: AIAgentSwapRoute;
      };
      transaction: {
        to: string;
        data: string;
        value: string;
        from: string;
        gasLimit: string;
        chainId: number;
        approval?: AIAgentApprovalTransaction | AIAgentApprovalTransaction[] | null;
        platformFeeAmount?: string;
        expectedUserOutput?: string;
        feeMode?: "tower-swap-executor" | "none";
        feeToken?: string;
        executorAddress?: string;
        feeRecipient?: string;
        feeBps?: number;
      };
    };
    bridge_execution?: {
      request: AIAgentBridgeRequest;
      estimatedFee?: string;
      estimatedTime?: string;
      message?: string;
    };
  };
}

export interface AIAgentError {
  error: string;
  code: string;
  message: string;
}

export interface ChatHistoryItem {
  id: number;
  created_at: string;
  user_query: string | null;
  ai_response: string | null;
  session_id: string | null;
  user_id: string | null;
}

// Use Next.js API proxy route (keeps API key secret)
const CHAT_ENDPOINT = "/api/ai/chat";

const readAgentErrorMessage = async (response: Response) => {
  const fallback = `HTTP error! status: ${response.status}`;
  const text = await response.text();

  if (!text.trim()) {
    return fallback;
  }

  try {
    const errorData = JSON.parse(text) as Partial<AIAgentError> & {
      detail?: unknown;
      upstreamStatus?: unknown;
    };

    for (const field of ["message", "error", "detail"] as const) {
      const value = errorData[field];

      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    return fallback;
  } catch {
    return text.slice(0, 500) || fallback;
  }
};

/**
 * Send a message to the Tower AI Agent and get a response
 */
export const sendMessageToAIAgent = async (
  request: AIAgentRequest
): Promise<AIAgentResponse> => {
  const url = CHAT_ENDPOINT;

  try {
    const walletForSession =
      request.wallet_address || request.userid || undefined;
    const canonicalWallet = walletForSession
      ? canonicalizeAiWalletAddress(walletForSession)
      : "";

    if (canonicalWallet) {
      await ensureWalletSession(canonicalWallet);
    }

    const proof = canonicalWallet
      ? await ensureAiWalletProof(canonicalWallet)
      : null;

    // Prepare request with wallet context and defaults.
    // wallet_address must be the exact string that was signed (lowercase).
    const payload = {
      ...request,
      ...(canonicalWallet
        ? {
            userid: canonicalWallet,
            wallet_address: canonicalWallet,
          }
        : {}),
      ...(proof
        ? {
            wallet_address: proof.address,
            wallet_signature: proof.signature,
            wallet_signature_timestamp: proof.timestamp,
          }
        : {}),
      chain_id: request.chain_id || 5042002, // Arc testnet
      enable_wallet_access: request.enable_wallet_access === true,
      enable_swap_execution: request.enable_swap_execution === true,
      enable_bridge_execution: request.enable_bridge_execution === true,
      enable_portfolio_analysis: request.enable_portfolio_analysis === true,
    };

    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await readAgentErrorMessage(response));
    }

    const data = (await response.json()) as AIAgentResponse;
    return data;
  } catch (error) {
    console.error("Error communicating with Tower AI agent:", error);
    throw error;
  }
};

/**
 * Send a message to the Tower AI Agent (streaming support for future use)
 * Currently uses regular response, will upgrade to streaming later
 */
export const sendMessageToAIAgentStream = async (
  request: AIAgentRequest,
  onChunk: (chunk: string) => void,
  onComplete: () => void,
  onError: (error: Error) => void
): Promise<void> => {
  try {
    const response = await sendMessageToAIAgent(request);
    // Emit the complete response as a single chunk
    onChunk(response.reply);
    onComplete();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    onError(err);
  }
};

/**
 * Get conversation history from Supabase
 */
export const getConversationHistory = async (
  sessionId: string,
  userId: string
): Promise<
  Pick<ChatHistoryItem, "created_at" | "user_query" | "ai_response">[]
> => {
  try {
    const params = new URLSearchParams({
      sessionId,
      walletAddress: userId,
    });
    const result = await userApiFetch<{
      data: Pick<ChatHistoryItem, "created_at" | "user_query" | "ai_response">[];
    }>(`/api/user/ai-history?${params.toString()}`, {
      walletAddress: userId,
    });

    if (!result.ok) {
      console.warn("Error fetching chat history from API:", result.error);
      return [];
    }

    return result.data?.data || [];
  } catch (error) {
    console.warn("Error fetching conversation history:", error);
    return [];
  }
};

/**
 * Save chat message to Supabase
 */
export const saveChatMessageToHistory = async (
  userId: string,
  sessionId: string,
  userQuery: string,
  aiResponse: string
): Promise<ChatHistoryItem | null> => {
  try {
    const result = await userApiFetch<{ data: ChatHistoryItem }>(
      "/api/user/ai-history",
      {
        method: "POST",
        walletAddress: userId,
        body: JSON.stringify({
          session_id: sessionId,
          user_query: userQuery,
          ai_response: aiResponse,
        }),
      },
    );

    if (!result.ok || !result.data?.data) {
      console.error("Error saving chat to API:", result.error);
      return null;
    }

    return result.data.data;
  } catch (error) {
    console.error("Error saving chat message:", error);
    return null;
  }
};

/**
 * Create a new chat session (generates a local session ID)
 */
export const createAIAgentSession = async (
  walletAddress: string
): Promise<{ sessionId: string }> => {
  void walletAddress;
  // Generate a local session ID using UUID
  // The backend doesn't need a separate session creation call
  const sessionId = crypto.randomUUID ? crypto.randomUUID() : generateUUID();
  return { sessionId };
};

/**
 * Fallback UUID generator if crypto.randomUUID is not available
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

