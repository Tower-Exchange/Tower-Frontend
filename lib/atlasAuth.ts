import { formatUnits, getAddress, isAddress, parseUnits, type Address } from "viem";

const parseBooleanEnv = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "off") {
    return false;
  }
  if (normalized === "true" || normalized === "1" || normalized === "on") {
    return true;
  }

  return null;
};

const resolveOptionalAddress = (value?: string | null) =>
  value && isAddress(value) ? getAddress(value) : null;

export const ATLAS_AUTH_CHAIN_ID = 5042;
export const ATLAS_AUTH_FEE_DECIMALS = 18;
export const ATLAS_AUTH_FEE_USDC_DEFAULT = "0.10";
export const ATLAS_AUTH_FEE_RECIPIENT_DEFAULT =
  "0xb3966683724303400B6fECDa1963825d994B546a" as Address;

export const isAtlasAuthEnabled = () =>
  parseBooleanEnv(process.env.ATLAS_AUTH_ENABLED) ??
  parseBooleanEnv(process.env.NEXT_PUBLIC_ATLAS_AUTH_ENABLED) ??
  true;

export const getAtlasAuthFeeRecipient = (): Address =>
  resolveOptionalAddress(process.env.NEXT_PUBLIC_ATLAS_AUTH_FEE_RECIPIENT) ||
  resolveOptionalAddress(process.env.ATLAS_AUTH_FEE_RECIPIENT) ||
  resolveOptionalAddress(process.env.NEXT_PUBLIC_TOWER_SWAP_FEE_RECIPIENT) ||
  resolveOptionalAddress(process.env.TOWER_SWAP_FEE_RECIPIENT) ||
  resolveOptionalAddress(process.env.NEXT_PUBLIC_BRIDGE_FEE_RECIPIENT_EVM) ||
  resolveOptionalAddress(process.env.NEXT_PUBLIC_BRIDGE_FEE_RECIPIENT) ||
  getAddress(ATLAS_AUTH_FEE_RECIPIENT_DEFAULT);

export const getAtlasAuthFeeWei = () => {
  const raw = (
    process.env.NEXT_PUBLIC_ATLAS_AUTH_FEE_USDC ||
    process.env.ATLAS_AUTH_FEE_USDC ||
    ATLAS_AUTH_FEE_USDC_DEFAULT
  ).trim();

  try {
    const amount = parseUnits(raw, ATLAS_AUTH_FEE_DECIMALS);
    if (amount > 0n) {
      return amount;
    }
  } catch {
    // Fall through to the documented $0.10 default.
  }

  return parseUnits(ATLAS_AUTH_FEE_USDC_DEFAULT, ATLAS_AUTH_FEE_DECIMALS);
};

export const getAtlasAuthFeeDisplay = () => {
  const formatted = Number(formatUnits(getAtlasAuthFeeWei(), ATLAS_AUTH_FEE_DECIMALS));
  if (!Number.isFinite(formatted)) {
    return "$0.10";
  }

  return `$${formatted.toFixed(2)}`;
};

const splitWalletList = (value?: string | null) =>
  (value ?? "")
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

export const getAtlasAuthWhitelist = () => {
  const addresses = new Set<string>();

  for (const entry of [
    ...splitWalletList(process.env.ATLAS_AUTH_WHITELIST),
    ...splitWalletList(process.env.NEXT_PUBLIC_ATLAS_AUTH_WHITELIST),
  ]) {
    if (isAddress(entry)) {
      addresses.add(entry.toLowerCase());
    }
  }

  return addresses;
};

export const isAtlasAuthWhitelisted = (walletAddress?: string | null) => {
  if (!walletAddress || !isAddress(walletAddress)) {
    return false;
  }

  return getAtlasAuthWhitelist().has(walletAddress.toLowerCase());
};
