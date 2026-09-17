import { getAeroQuote, AERO_MAINNET_TOKENS, createAeroPublicClient } from "@/lib/aeroDex";

const client = createAeroPublicClient("https://rpc.drpc.mainnet.arc.io");

const quote = await getAeroQuote({
  client,
  inputToken: AERO_MAINNET_TOKENS.USDC,
  outputToken: AERO_MAINNET_TOKENS.EURC,
  inputAmount: 1_000_000n,
  slippageBps: 50,
});

console.log("USDC->EURC", quote);

const reverse = await getAeroQuote({
  client,
  inputToken: AERO_MAINNET_TOKENS.EURC,
  outputToken: AERO_MAINNET_TOKENS.USDC,
  inputAmount: 1_000_000n,
  slippageBps: 50,
});

console.log("EURC->USDC", reverse);
