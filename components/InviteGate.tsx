"use client";

import {
  useCallback,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";

import { ErrorBadge } from "@/components/ui/error-badge";
import { useRainbowKitAuth } from "@/lib/use-rainbowkit-auth";
import { cn } from "@/lib/utils";

const LEGACY_ACCESS_SESSION_KEY = "towerInviteAccessSession";
const LEGACY_ACCESS_STORAGE_KEY = "towerInviteAccessGranted";
const ACCESS_STATE_STORAGE_KEY = "towerInviteGateStateV2";
const DISCORD_INVITE_URL = "https://discord.gg/ftXUD6qa4J";
const TELEGRAM_INVITE_URL = "https://t.me/TowerExchangeCommunity";

type InviteAccessState =
  | { status: "locked" }
  | { status: "pending-invite" }
  | { status: "wallet-verified"; walletAddress: string };

const LOCKED_ACCESS_STATE: InviteAccessState = { status: "locked" };

const normalizeWalletAddress = (walletAddress?: string | null) => {
  if (typeof walletAddress !== "string") {
    return null;
  }

  const normalizedWalletAddress = walletAddress.trim().toLowerCase();
  return normalizedWalletAddress || null;
};

const clearLegacyInviteAccess = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(LEGACY_ACCESS_SESSION_KEY);
  window.localStorage.removeItem(LEGACY_ACCESS_STORAGE_KEY);
};

const readStoredAccessState = (): InviteAccessState => {
  if (typeof window === "undefined") {
    return LOCKED_ACCESS_STATE;
  }

  clearLegacyInviteAccess();

  try {
    const rawAccessState = window.sessionStorage.getItem(ACCESS_STATE_STORAGE_KEY);
    if (!rawAccessState) {
      return LOCKED_ACCESS_STATE;
    }

    const parsedAccessState = JSON.parse(rawAccessState) as Partial<
      InviteAccessState & { walletAddress?: string | null }
    >;

    if (parsedAccessState.status === "pending-invite") {
      return { status: "pending-invite" };
    }

    if (parsedAccessState.status === "wallet-verified") {
      const walletAddress = normalizeWalletAddress(parsedAccessState.walletAddress);

      if (walletAddress) {
        return {
          status: "wallet-verified",
          walletAddress,
        };
      }
    }
  } catch (error) {
    console.error("Failed to restore invite gate access state:", error);
  }

  window.sessionStorage.removeItem(ACCESS_STATE_STORAGE_KEY);
  return LOCKED_ACCESS_STATE;
};

const persistAccessState = (accessState: InviteAccessState) => {
  if (typeof window === "undefined") {
    return;
  }

  clearLegacyInviteAccess();

  if (accessState.status === "locked") {
    window.sessionStorage.removeItem(ACCESS_STATE_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(
    ACCESS_STATE_STORAGE_KEY,
    JSON.stringify(accessState),
  );
};

const getInviteErrorLabel = (message?: string | null) => {
  const normalized = message?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return "Invalid invite code.";
  }

  if (normalized.includes("required")) {
    return "Enter an invite code.";
  }

  if (normalized.includes("usage limit")) {
    return "Invite code limit reached.";
  }

  if (
    normalized.includes("expired") ||
    normalized.includes("not found") ||
    normalized.includes("missing invite session")
  ) {
    return "Enter your invite code again.";
  }

  if (normalized.includes("linked to another wallet")) {
    return "Invite already linked.";
  }

  if (normalized.includes("empty response")) {
    return "Please try again.";
  }

  if (
    normalized.includes("unable to validate") ||
    normalized.includes("unable to finalize") ||
    normalized.includes("unable to verify") ||
    normalized.includes("unexpected error")
  ) {
    return "Enter code to continue";
  }

  return message && message.length <= 32 ? message : "Invalid invite code.";
};

type InviteGateProps = {
  children: ReactNode;
};

export default function InviteGate({ children }: InviteGateProps) {
  const [inviteCode, setInviteCode] = useState("");
  const [accessState, setAccessState] = useState<InviteAccessState>(() =>
    readStoredAccessState(),
  );
  const [lastCheckedWalletAddress, setLastCheckedWalletAddress] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isCheckingRegistration, setIsCheckingRegistration] = useState(false);
  const [isFinalizingInvite, setIsFinalizingInvite] = useState(false);
  const { authenticated, login, user, ready } = useRainbowKitAuth();

  const currentWalletAddress = normalizeWalletAddress(user?.wallet?.address);
  const hasPendingInviteAccess = accessState.status === "pending-invite";
  const hasWalletAccess =
    accessState.status === "wallet-verified" &&
    currentWalletAddress !== null &&
    accessState.walletAddress === currentWalletAddress;

  const requireInviteForWallet = useCallback((
    walletAddress: string | null,
    nextError: string | null = null,
  ) => {
    persistAccessState(LOCKED_ACCESS_STATE);
    setAccessState(LOCKED_ACCESS_STATE);
    setLastCheckedWalletAddress(walletAddress);
    setInviteCode("");
    setSubmitError(nextError);
    setIsSubmitting(false);
    setIsConnectingWallet(false);
    setIsCheckingRegistration(false);
    setIsFinalizingInvite(false);
  }, []);

  const setPendingInviteAccess = () => {
    const nextAccessState: InviteAccessState = { status: "pending-invite" };

    persistAccessState(nextAccessState);
    setAccessState(nextAccessState);
    setLastCheckedWalletAddress(null);
    setInviteCode("");
    setSubmitError(null);
    setIsSubmitting(false);
    setIsConnectingWallet(false);
  };

  const grantWalletAccess = useCallback((walletAddress: string) => {
    const nextAccessState: InviteAccessState = {
      status: "wallet-verified",
      walletAddress,
    };

    persistAccessState(nextAccessState);
    setAccessState(nextAccessState);
    setLastCheckedWalletAddress(walletAddress);
    setInviteCode("");
    setSubmitError(null);
    setIsSubmitting(false);
    setIsConnectingWallet(false);
    setIsCheckingRegistration(false);
    setIsFinalizingInvite(false);
  }, []);

  useEffect(() => {
    clearLegacyInviteAccess();
  }, []);

  useEffect(() => {
    if (!authenticated || !currentWalletAddress) {
      setLastCheckedWalletAddress(null);
    }
  }, [authenticated, currentWalletAddress]);

  // Keep the app locked until the connected wallet has been explicitly verified.
  // Invite-code users may connect after entering a code, but the wallet must still
  // be finalized against that invite before the app is unlocked.
  const shouldGate = !ready || !authenticated || !hasWalletAccess;

  const shouldShowInviteForm =
    ready &&
    authenticated &&
    currentWalletAddress !== null &&
    !hasWalletAccess &&
    !hasPendingInviteAccess &&
    !isCheckingRegistration &&
    !isFinalizingInvite &&
    lastCheckedWalletAddress === currentWalletAddress;

  const shouldShowWalletResolutionState =
    ready &&
    authenticated &&
    currentWalletAddress !== null &&
    !hasWalletAccess &&
    !shouldShowInviteForm;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousInviteGateState = document.body.dataset.inviteGateOpen;

    if (shouldGate) {
      document.body.style.overflow = "hidden";
      document.body.dataset.inviteGateOpen = "true";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousInviteGateState) {
        document.body.dataset.inviteGateOpen = previousInviteGateState;
      } else {
        delete document.body.dataset.inviteGateOpen;
      }
    };
  }, [shouldGate]);

  const isAccessButtonDisabled = useMemo(() => {
    return (
      !ready ||
      !authenticated ||
      !currentWalletAddress ||
      !inviteCode.trim() ||
      isSubmitting ||
      isCheckingRegistration ||
      isFinalizingInvite ||
      hasPendingInviteAccess
    );
  }, [
    hasPendingInviteAccess,
    authenticated,
    currentWalletAddress,
    inviteCode,
    isCheckingRegistration,
    isFinalizingInvite,
    isSubmitting,
    ready,
  ]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isAccessButtonDisabled) {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/invite/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: inviteCode,
          walletAddress: currentWalletAddress,
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
        requiresWalletConnection?: boolean;
      };

      if (!response.ok || !result.success) {
        setIsSubmitting(false);
        setSubmitError(getInviteErrorLabel(result.message));
        return;
      }

      if (!currentWalletAddress || result.requiresWalletConnection) {
        setPendingInviteAccess();
        return;
      }

      grantWalletAccess(currentWalletAddress);
    } catch (error) {
      console.error("Failed to redeem invite code:", error);
      setIsSubmitting(false);
      setSubmitError(getInviteErrorLabel("Unable to validate invite code right now."));
    }
  };

  const handleConnectWallet = async () => {
    if (authenticated || isConnectingWallet) {
      return;
    }

    setIsConnectingWallet(true);

    try {
      await login();
    } catch (error) {
      console.error("Failed to connect wallet from invite gate:", error);
    } finally {
      setIsConnectingWallet(false);
    }
  };

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!authenticated || !currentWalletAddress) {
      setIsCheckingRegistration(false);
      setIsFinalizingInvite(false);
      return;
    }

    if (hasWalletAccess) {
      return;
    }

    let cancelled = false;

    const resolveWalletAccess = async () => {
      setIsCheckingRegistration(true);
      setIsFinalizingInvite(false);

      try {
        const response = await fetch("/api/auth/check-wallet", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            walletAddress: currentWalletAddress,
          }),
        });

        const result = (await response.json()) as {
          success?: boolean;
          isRegistered?: boolean;
          message?: string;
        };

        if (cancelled) {
          return;
        }

        if (!response.ok || !result.success) {
          requireInviteForWallet(
            currentWalletAddress,
            getInviteErrorLabel(
              result.message ?? "Unable to verify wallet registration.",
            ),
          );
          return;
        }

        if (result.isRegistered) {
          grantWalletAccess(currentWalletAddress);
          return;
        }

        if (!hasPendingInviteAccess) {
          requireInviteForWallet(currentWalletAddress, null);
          return;
        }

        setIsCheckingRegistration(false);
        setIsFinalizingInvite(true);

        const finalizeResponse = await fetch("/api/invite/finalize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            walletAddress: currentWalletAddress,
          }),
        });

        const finalizeResult = (await finalizeResponse.json()) as {
          success?: boolean;
          message?: string;
        };

        if (cancelled) {
          return;
        }

        if (!finalizeResponse.ok || !finalizeResult.success) {
          requireInviteForWallet(
            currentWalletAddress,
            getInviteErrorLabel(finalizeResult.message),
          );
          return;
        }

        grantWalletAccess(currentWalletAddress);
      } catch (error) {
        console.error("Failed to resolve wallet access:", error);

        if (!cancelled) {
          requireInviteForWallet(
            currentWalletAddress,
            getInviteErrorLabel("Unable to verify wallet registration."),
          );
        }
      } finally {
        if (!cancelled) {
          setIsCheckingRegistration(false);
          setIsFinalizingInvite(false);
        }
      }
    };

    void resolveWalletAccess();

    return () => {
      cancelled = true;
    };
  }, [
    authenticated,
    currentWalletAddress,
    grantWalletAccess,
    hasPendingInviteAccess,
    hasWalletAccess,
    requireInviteForWallet,
    ready,
  ]);

  return (
    <>
      <div
        className={cn(
          "min-h-screen transition-all duration-300",
          shouldGate && "pointer-events-none select-none",
        )}
      >
        {children}
      </div>

      <AnimatePresence>
        {shouldGate && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="fixed inset-0 z-[150] bg-[linear-gradient(180deg,rgba(4,4,5,0.12)_0%,rgba(4,4,5,0.18)_14%,rgba(4,4,5,0.26)_38%,rgba(4,4,5,0.32)_100%)] backdrop-blur-[10px]"
            />

            <div className="fixed inset-0 z-[160] overflow-y-auto px-4 py-6 sm:px-6 sm:py-10">
              <div className="flex min-h-full items-center justify-center">
                <motion.section
                  initial={{ opacity: 0, y: 24, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 24, scale: 0.96 }}
                  transition={{ duration: 0.26, ease: "easeOut" }}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="invite-gate-title"
                  className="relative w-full max-w-[26.5rem] overflow-hidden rounded-[1.6rem] border border-border bg-card text-white shadow-[0_30px_90px_rgba(0,0,0,0.72)]"
                >
                  <div className="relative aspect-[488/193] w-full overflow-hidden bg-input">
                    <div className="absolute inset-0 opacity-[0.085] [background-image:radial-gradient(circle,rgba(255,255,255,0.92)_0.65px,transparent_0.7px)] [background-size:7px_7px]" />
                    <div className="absolute left-1/2 top-[-7.45rem] h-[26.8rem] w-[26.8rem] -translate-x-[61.5%] rounded-full border border-[#21242a]/70" />
                    <div className="absolute left-1/2 top-[-3.35rem] h-[18.7rem] w-[18.7rem] -translate-x-[61.5%] rounded-full border border-[#1b1f25]/72" />
                    <div className="absolute left-1/2 top-[-0.85rem] h-[13.1rem] w-[13.1rem] -translate-x-[61.5%] rounded-full border border-[#171a20]/75" />

                    <Image
                      src="/assets/invite-tower.png"
                      alt="Tower artwork"
                      width={164}
                      height={164}
                      className="pointer-events-none absolute right-0 top-[0.2rem] h-[8.35rem] w-auto opacity-[0.42]"
                      style={{
                        WebkitMaskImage:
                          "linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.94) 36%, rgba(0,0,0,0.24) 100%)",
                        maskImage:
                          "linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.94) 36%, rgba(0,0,0,0.24) 100%)",
                      }}
                    />

                    <div className="absolute inset-y-0 right-0 w-[26%] bg-gradient-to-l from-[#121213]/96 via-[#121213]/18 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 h-[36%] bg-gradient-to-t from-[#121213] via-[#121213]/90 to-transparent" />
                    <div className="absolute right-[4.9rem] top-0 h-[64%] w-[4.8rem] opacity-[0.045] [background-image:radial-gradient(circle,rgba(255,255,255,0.92)_0.65px,transparent_0.7px)] [background-size:7px_7px]" />

                    <div className="absolute left-[47.6%] top-[55.5%] z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-[0.65rem]">
                      <Image
                        src="/assets/towerlogo.svg"
                        alt="Tower logo"
                        width={80}
                        height={80}
                        className="h-[5rem] w-[5rem] object-contain scale-200"
                      />
                    </div>
                  </div>

                  <div className="px-4 pb-6 pt-4 text-center sm:px-6 sm:pb-7 sm:pt-5">
                    <div className="space-y-2.5">
                      <h1
                        id="invite-gate-title"
                        className="text-[1.25rem] font-semibold leading-[1.08] tracking-[-0.04em] text-white sm:text-[1.35rem] whitespace-nowrap"
                      >
                        Tower is invite-only
                      </h1>
                      <p className="mx-auto whitespace-nowrap text-[0.8rem] leading-6 text-[#6E7178] sm:max-w-[21rem]">
                        Beta access requires an invite code
                      </p>
                    </div>

                    {!ready ? (
                      <div className="mt-8 flex items-center justify-center gap-2 text-[0.88rem] text-[#7B7E85]">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading access...</span>
                      </div>
                    ) : shouldShowWalletResolutionState ? (
                      <div className="mt-6 space-y-4">
                        <div className="flex items-center justify-center gap-2 text-[0.88rem] text-[#7B7E85]">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>
                            {isFinalizingInvite
                              ? "Linking invite to wallet..."
                              : hasPendingInviteAccess
                                ? "Invite accepted. Connect your wallet to finish access."
                                : "Checking wallet access..."}
                          </span>
                        </div>

                        {submitError ? (
                          <ErrorBadge
                            message={submitError}
                            fallback="Unable to verify wallet access."
                            centered
                            className="border-[#ff8c8c]/18 bg-[#2a1518]/80 text-[#ff9a9a]"
                          />
                        ) : null}
                      </div>
                    ) : shouldShowInviteForm ? (
                      <>
                        <p className="mt-5 text-[0.8rem] leading-6 text-[#7B7E85]">
                          This wallet needs an invite code before it can enter Tower.
                        </p>

                        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
                          <label className="invite-gate-input-shell block overflow-hidden rounded-sm border border-border bg-input shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-colors focus-within:border-border">
                            <span className="sr-only">Invite code</span>
                            <input
                              type="text"
                              value={inviteCode}
                              disabled={isSubmitting}
                              onChange={(event) => {
                                setInviteCode(event.target.value.toUpperCase());
                                if (submitError) {
                                  setSubmitError(null);
                                }
                              }}
                              placeholder="Enter your invite code"
                              autoComplete="one-time-code"
                              autoFocus
                              aria-invalid={submitError ? "true" : "false"}
                              aria-describedby={
                                submitError ? "invite-code-error" : undefined
                              }
                              className="invite-gate-input h-[2.8rem] w-full rounded-sm border border-transparent bg-transparent px-5 text-center text-[0.85rem] text-white caret-[#7BB8FF] shadow-none outline-none ring-0 transition placeholder:text-[#6E7178] focus:border-transparent focus:shadow-none focus:outline-none focus:ring-0 focus-visible:border-transparent focus-visible:shadow-none focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:text-[#7B7E85]"
                              style={{
                                WebkitAppearance: "none",
                                appearance: "none",
                                boxShadow: "none",
                                outline: "none",
                              }}
                            />
                          </label>

                          {submitError ? (
                            <div id="invite-code-error">
                              <ErrorBadge
                                message={submitError}
                                fallback="Invalid invite code."
                                centered
                                className="border-[#ff8c8c]/18 bg-[#2a1518]/80 text-[#ff9a9a]"
                              />
                            </div>
                          ) : null}

                          <button
                            type="submit"
                            disabled={isAccessButtonDisabled}
                            className={cn(
                              "inline-flex h-[3.25rem] w-full items-center justify-center gap-2 rounded-full text-[0.98rem] font-medium transition-all",
                              isAccessButtonDisabled
                                ? "cursor-not-allowed bg-[#2B2D31] text-[#5F636C]"
                                : "bg-primary text-black hover:opacity-90",
                            )}
                          >
                            {isSubmitting ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Checking code</span>
                              </>
                            ) : (
                              <span>Access Tower</span>
                            )}
                          </button>
                        </form>
                      </>
                    ) : (
                      <div className="mt-6 space-y-4">
                        <p className="mx-auto max-w-[21rem] text-[0.8rem] leading-6 text-[#7B7E85]">
                          {hasPendingInviteAccess
                            ? "Invite accepted. Connect the same wallet to finish access."
                            : "Connect your wallet to continue. Existing users will be admitted automatically, and new wallets will need an invite code."}
                        </p>

                        <button
                          type="button"
                          onClick={handleConnectWallet}
                          disabled={isConnectingWallet}
                          className={cn(
                            "inline-flex h-[3.25rem] w-full items-center justify-center gap-2 rounded-full text-[0.98rem] font-medium transition-all",
                            isConnectingWallet
                              ? "cursor-wait bg-[#2B2D31] text-[#5F636C]"
                              : "bg-primary text-black hover:opacity-90",
                          )}
                        >
                          {isConnectingWallet ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Opening wallet</span>
                            </>
                          ) : (
                            <span>Connect Wallet</span>
                          )}
                        </button>

                        {submitError ? (
                          <ErrorBadge
                            message={submitError}
                            fallback="Unable to verify wallet access."
                            centered
                            className="border-[#ff8c8c]/18 bg-[#2a1518]/80 text-[#ff9a9a]"
                          />
                        ) : null}
                      </div>
                    )}

                    <div className="mt-5 space-y-3">
                      <p className="mx-auto w-fit whitespace-nowrap text-left text-[0.72rem] leading-[1.1rem] text-white sm:text-[0.76rem] sm:leading-5">
                        <span>Get an invite code on </span>
                        <a
                          href={DISCORD_INVITE_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline decoration-primary underline-offset-4 transition-colors hover:text-[#9cccff] hover:decoration-[#9cccff]"
                        >
                          Discord
                        </a>
                        <span> or </span>
                        <a
                          href={TELEGRAM_INVITE_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline decoration-primary underline-offset-4 transition-colors hover:text-[#9cccff] hover:decoration-[#9cccff]"
                        >
                          Telegram
                        </a>
                      </p>
                    </div>
                  </div>
                </motion.section>
              </div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
