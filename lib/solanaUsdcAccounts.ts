import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

import {
  getSolanaUsdcMint,
  SOLANA_DEVNET_USDC_MINT,
  SOLANA_MAINNET_USDC_MINT,
} from "@/lib/bridgeNetworks";

export { SOLANA_DEVNET_USDC_MINT, SOLANA_MAINNET_USDC_MINT, getSolanaUsdcMint };

export const normalizeSolanaAddress = (address: string) => address.trim();

export const isValidSolanaAddress = (address: string) => {
  try {
    new PublicKey(normalizeSolanaAddress(address));
    return true;
  } catch {
    return false;
  }
};

export const getSolanaUsdcAssociatedTokenAddress = (
  ownerAddress: string,
  chainId?: string | null,
) => {
  const owner = new PublicKey(normalizeSolanaAddress(ownerAddress));
  const mint = new PublicKey(getSolanaUsdcMint(chainId));

  return getAssociatedTokenAddressSync(mint, owner, false).toBase58();
};
