"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { useSwitchChain } from "wagmi";
import { getWalletClient } from "wagmi/actions";

import { ErrorBadge } from "@/components/ui/error-badge";
import {
  ATLAS_AUTH_CHAIN_ID,
  getAtlasAuthFeeDisplay,
  getAtlasAuthFeeRecipient,
  getAtlasAuthFeeWei,
  isAtlasAuthEnabled,
} from "@/lib/atlasAuth";
import {
  confirmAtlasAuthPayment,
  fetchAtlasAuthStatus,
} from "@/lib/atlasAuthClient";
import { ensureWalletOnArcNetwork } from "@/lib/arcWalletNetwork";
import { useRainbowKitAuth } from "@/lib/use-rainbowkit-auth";
import { ensureWalletSession } from "@/lib/walletSessionClient";
import { wagmiConfig } from "@/lib/wagmi-config";
import chatLogo from "@/public/assets/chat_logo.svg";

type AtlasAuthGateProps = {
  onAccessChange?: (hasAccess: boolean) => void;
};

const shortenAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

const getPaymentErrorMessage = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("user rejected") ||
    normalized.includes("user denied") ||
    normalized.includes("rejected the request")
  ) {
    return "Payment cancelled in wallet.";
  }

  if (normalized.includes("insufficient funds") || normalized.includes("exceeds the balance")) {
    return "Insufficient USDC to pay the Atlas authentication fee.";
  }

  return message || "Unable to complete Atlas authentication.";
};

export const AtlasAuthGate = ({ onAccessChange }: AtlasAuthGateProps) => {
  const enabled = isAtlasAuthEnabled();
  const { user, login, ready } = useRainbowKitAuth();
  const { switchChainAsync } = useSwitchChain();
  const walletAddress = user?.wallet?.address?.toLowerCase() ?? null;
  const feeLabel = getAtlasAuthFeeDisplay();

  const [checking, setChecking] = useState(enabled);
  const [authenticated, setAuthenticated] = useState(!enabled);
  const [paying, setPaying] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const notifyAccess = useCallback(
    (hasAccess: boolean) => {
      setAuthenticated(hasAccess);
      onAccessChange?.(hasAccess);
    },
    [onAccessChange],
  );

  useEffect(() => {
    if (!enabled) {
      notifyAccess(true);
      setChecking(false);
      return;
    }

    if (!ready) {
      notifyAccess(false);
      setChecking(true);
      return;
    }

    if (!walletAddress) {
      notifyAccess(false);
      setChecking(false);
      setError(null);
      setStatusMessage(null);
      return;
    }

    let cancelled = false;

    const loadStatus = async () => {
      setChecking(true);
      setError(null);

      try {
        await ensureWalletSession(walletAddress);
        const isAuthenticated = await fetchAtlasAuthStatus();
        if (!cancelled) {
          notifyAccess(isAuthenticated);
        }
      } catch (loadError) {
        if (!cancelled) {
          notifyAccess(false);
          setError(getPaymentErrorMessage(loadError));
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    };

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, [enabled, notifyAccess, ready, walletAddress]);

  const handlePay = async () => {
    if (!walletAddress) {
      login();
      return;
    }

    setPaying(true);
    setError(null);
    setStatusMessage("Switching to Arc...");

    try {
      await ensureWalletSession(walletAddress);
      await ensureWalletOnArcNetwork("mainnet", switchChainAsync);

      const walletClient = await getWalletClient(wagmiConfig, {
        chainId: ATLAS_AUTH_CHAIN_ID,
      });
      if (!walletClient?.account) {
        throw new Error("Wallet is not ready. Reconnect and try again.");
      }

      setStatusMessage(`Confirm ${feeLabel} USDC in your wallet...`);
      const txHash = await walletClient.sendTransaction({
        account: walletClient.account,
        chain: walletClient.chain,
        to: getAtlasAuthFeeRecipient(),
        value: getAtlasAuthFeeWei(),
      });

      setStatusMessage("Confirming payment on Arc...");
      await confirmAtlasAuthPayment(txHash);
      notifyAccess(true);
      setStatusMessage(null);
    } catch (payError) {
      setError(getPaymentErrorMessage(payError));
      setStatusMessage(null);
    } finally {
      setPaying(false);
    }
  };

  if (!enabled || authenticated) {
    return null;
  }

  const isConnectStep = !walletAddress;
  const isBusy = !ready || checking || paying;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/88 px-4 backdrop-blur-md">
      <div className="w-full max-w-[24rem] rounded-[1.75rem] border border-border bg-card/95 px-6 py-8 text-center shadow-[0_28px_80px_rgba(0,0,0,0.18)] dark:shadow-[0_28px_80px_rgba(0,0,0,0.48)]">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
          <Image
            src={chatLogo}
            alt="Atlas"
            width={32}
            height={32}
            className="object-contain"
          />
        </div>

        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {isConnectStep && ready ? "Connect to use Atlas" : "Unlock Atlas"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {isConnectStep
            ? "Connect your wallet on Tower Exchange to continue."
            : `Pay a one-time ${feeLabel} USDC fee. This permanently unlocks Atlas for this wallet.`}
        </p>

        {walletAddress ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {shortenAddress(walletAddress)}
          </p>
        ) : null}

        {statusMessage ? (
          <div className="mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{statusMessage}</span>
          </div>
        ) : null}

        {error ? (
          <div className="mt-5">
            <ErrorBadge message={error} centered />
          </div>
        ) : null}

        <button
          type="button"
          disabled={isBusy && !isConnectStep}
          onClick={isConnectStep ? login : handlePay}
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-[#081019] transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {!ready || checking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isConnectStep ? (
            "Connect wallet"
          ) : paying ? (
            "Paying..."
          ) : (
            `Pay ${feeLabel} USDC`
          )}
        </button>
      </div>
    </div>
  );
};
