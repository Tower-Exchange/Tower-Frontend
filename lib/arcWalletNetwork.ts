import { getBrowserWalletProvider } from "@/lib/browser-wallet";
import {
  ARC_NETWORK_CHAIN_ID,
  getArcAddNetworkParams,
  getArcNetworkHex,
  getArcNetworkLabel,
  normalizeArcChainHex,
} from "@/lib/arcNetwork";
import type { BridgeNetworkMode } from "@/lib/bridgeNetworks";

const getWalletErrorCode = (error: unknown) =>
  error && typeof error === "object" && "code" in error
    ? (error as { code?: number }).code
    : undefined;

export async function ensureWalletOnArcNetwork(
  mode: BridgeNetworkMode,
  switchChainAsync?: (args: { chainId: number }) => Promise<unknown>,
) {
  const chainId = ARC_NETWORK_CHAIN_ID[mode];
  const chainHex = getArcNetworkHex(mode);
  const addParams = getArcAddNetworkParams(mode);
  const label = getArcNetworkLabel(mode);

  if (switchChainAsync) {
    try {
      await switchChainAsync({ chainId });
      return;
    } catch (error) {
      if (getWalletErrorCode(error) === 4001) {
        throw new Error(`Please approve switching to ${label} in your wallet.`);
      }
    }
  }

  let provider: ReturnType<typeof getBrowserWalletProvider>;
  try {
    provider = getBrowserWalletProvider();
  } catch {
    return;
  }

  try {
    const currentChainId = await provider.request({ method: "eth_chainId" });
    if (
      typeof currentChainId === "string" &&
      normalizeArcChainHex(currentChainId) === normalizeArcChainHex(chainHex)
    ) {
      return;
    }
  } catch (error) {
    console.warn("Unable to read wallet chain before Arc network switch:", error);
  }

  const switchToTargetChain = async () => {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainHex }],
    });
  };

  const addOrUpdateTargetChain = async () => {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: addParams,
    });
  };

  try {
    try {
      await addOrUpdateTargetChain();
    } catch (addError) {
      if (getWalletErrorCode(addError) === 4001) {
        throw new Error(
          `Please approve adding ${label} to your wallet to continue.`,
        );
      }

      console.warn(`Unable to refresh ${label} network config in wallet:`, addError);
    }

    await switchToTargetChain();
  } catch (switchError) {
    if (getWalletErrorCode(switchError) === 4902) {
      await addOrUpdateTargetChain();
      await switchToTargetChain();
    } else if (getWalletErrorCode(switchError) === 4001) {
      throw new Error(`Please approve switching to ${label} in your wallet.`);
    } else {
      throw switchError;
    }
  }

  const currentChainId = await provider.request({ method: "eth_chainId" });
  if (
    typeof currentChainId !== "string" ||
    normalizeArcChainHex(currentChainId) !== normalizeArcChainHex(chainHex)
  ) {
    throw new Error(`Please switch to ${label} to continue`);
  }
}
