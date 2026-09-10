const MAX_ERROR_LABEL_LENGTH = 34;

const COMPACT_ERROR_LABELS: Array<{
  label: string;
  matches: string[];
}> = [
  {
    label: "Enter an invite code.",
    matches: ["invite code is required"],
  },
  {
    label: "Invalid invite code.",
    matches: ["invalid invite code"],
  },
  {
    label: "Invite code limit reached.",
    matches: ["usage limit"],
  },
  {
    label: "Code already used on this wallet.",
    matches: ["wallet already redeemed this invite code"],
  },
  {
    label: "Unable to verify code.",
    matches: ["unable to validate invite code", "unexpected error while validating invite code"],
  },
  {
    label: "Unable to load balance.",
    matches: ["failed to fetch balance"],
  },
  {
    label: "Unable to load activities.",
    matches: ["failed to load activities"],
  },
  {
    label: "Unable to load holdings.",
    matches: ["failed to load holdings"],
  },
  {
    label: "Unable to load orders.",
    matches: ["failed to load recurring orders"],
  },
  {
    label: "Unable to cancel order.",
    matches: ["failed to cancel order"],
  },
  {
    label: "Unable to create buy order.",
    matches: ["failed to create recurring buy order"],
  },
  {
    label: "Unable to create sell order.",
    matches: ["failed to create recurring sell order"],
  },
  {
    label: "Unable to upload image.",
    matches: ["failed to upload profile picture"],
  },
  {
    label: "Unable to load tokens.",
    matches: ["failed to fetch tokens"],
  },
  {
    label: "Unable to load routers.",
    matches: ["failed to fetch routers", "failed to load routers"],
  },
  {
    label: "Invalid router response.",
    matches: ["invalid routers response format"],
  },
  {
    label: "Unable to get a response.",
    matches: ["failed to get response"],
  },
  {
    label: "Unable to send message.",
    matches: [
      "failed to send message",
      "unable to reach the ai service",
      "unable to reach ai service",
    ],
  },
  {
    label: "AI is taking too long.",
    matches: [
      "taking too long to respond",
      "ai request timed out",
      "ai is taking too long",
    ],
  },
  {
    label: "Unable to create session.",
    matches: ["failed to create session"],
  },
  {
    label: "Unable to load history.",
    matches: ["failed to fetch history"],
  },
  {
    label: "Unable to confirm transaction.",
    matches: ["failed to process transaction confirmation"],
  },
  {
    label: "Unable to submit fee.",
    matches: ["failed to submit fee"],
  },
  {
    label: "Unable to get quote.",
    matches: ["failed to get quote", "failed to get swap quote"],
  },
  {
    label: "Unable to build transaction.",
    matches: ["failed to build swap transaction"],
  },
  {
    label: "Token approval failed.",
    matches: ["token approval failed"],
  },
  {
    label: "Unable to add Arc Testnet.",
    matches: ["failed to add arc testnet network"],
  },
  {
    label: "Switch to Arc Testnet.",
    matches: ["invalid chain id", "please switch to arc testnet", "switch to arc testnet"],
  },
  {
    label: "RPC endpoint unavailable.",
    matches: ["failed to reach upstream rpc endpoint"],
  },
  {
    label: "Unsupported chain.",
    matches: ["unsupported chain"],
  },
  {
    label: "Unsupported token.",
    matches: ["unsupported token"],
  },
  {
    label: "Required fields are missing.",
    matches: ["missing required fields", "missing required parameters"],
  },
  {
    label: "Connect your wallet first.",
    matches: ["please connect your wallet first", "please connect your wallet"],
  },
  {
    label: "Chat session is unavailable.",
    matches: ["chat session not initialized"],
  },
  {
    label: "Wallet request failed.",
    matches: ["internal json-rpc error", "wallet connection failed"],
  },
  {
    label: "Network request failed.",
    matches: ["network error"],
  },
  {
    label: "Transaction failed.",
    matches: ["transaction failed"],
  },
];

const cleanMessage = (message: string) =>
  message.replace(/\s+/g, " ").replace(/^error:\s*/i, "").trim();

const withSentencePunctuation = (message: string) =>
  /[.!?]$/.test(message) ? message : `${message}.`;

export const summarizeAppErrorMessage = (
  message: string | null | undefined,
  fallback = "Something went wrong.",
) => {
  const normalized = typeof message === "string" ? cleanMessage(message) : "";

  if (!normalized) {
    return fallback;
  }

  const lowercased = normalized.toLowerCase();
  const matchedLabel = COMPACT_ERROR_LABELS.find(({ matches }) =>
    matches.some((match) => lowercased.includes(match)),
  );

  if (matchedLabel) {
    return matchedLabel.label;
  }

  const firstSentenceMatch = normalized.match(/^.*?[.!?](?:\s|$)/);
  const firstSentence = firstSentenceMatch?.[0].trim() ?? normalized;

  if (firstSentence.length <= MAX_ERROR_LABEL_LENGTH) {
    return withSentencePunctuation(firstSentence);
  }

  return `${firstSentence.slice(0, MAX_ERROR_LABEL_LENGTH - 3).trimEnd()}...`;
};
