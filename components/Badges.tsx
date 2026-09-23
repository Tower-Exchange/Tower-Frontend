"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import badgeClaimedImage from "@/public/assets/Squire 2.svg";
import badgeUnclaimedImage from "@/public/assets/Dull 2.svg";
import mysteryBadgeImage from "@/public/assets/mystery badge.svg";
import starIcon from "@/public/assets/Star icon.svg";
import { CountdownBadgeModal } from "@/components/CountdownBadgeModal";
import {
  claimSquireBadge,
  fetchSquireBadgeStatus,
  getBadgeErrorLabel,
  type SquireBadgeStatus,
} from "@/lib/squireBadge";

type Badge = {
  id: string;
  name: string;
  alt: string;
  isClaimed: boolean;
  isInteractive: boolean;
  isMystery?: boolean;
};

const badges: Badge[] = [
  {
    id: "squire",
    name: "Squire",
    alt: "Squire badge",
    isClaimed: false,
    isInteractive: true,
  },
  {
    id: "badge-slot-2",
    name: "",
    alt: "Mystery badge",
    isClaimed: false,
    isInteractive: true,
    isMystery: true,
  },
  {
    id: "badge-slot-3",
    name: "",
    alt: "Unclaimed badge",
    isClaimed: false,
    isInteractive: false,
  },
];

const getBadgeDescription = (isClaimed: boolean) =>
  isClaimed
    ? "You've taken your first step on Tower.\nYou're a real user."
    : "This badge is for real users who have\ntaken their first step on Tower.";

const BadgeDetailsModal = ({
  badge,
  onClose,
}: {
  badge: Badge | null;
  onClose: () => void;
}) => {
  // Always show the brown (claimed) badge image for squire badge in the modal
  const badgeImage =
    badge?.id === "squire" ? badgeClaimedImage : badge?.isClaimed ? badgeClaimedImage : badgeUnclaimedImage;

  return (
    <AnimatePresence>
      {badge && (
        <>
          <motion.button
            type="button"
            aria-label="Close badge details"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${badge.name} badge details`}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed inset-0 z-[91] flex items-center justify-center px-4 py-6"
          >
            <div className="relative w-full max-w-[580px] rounded-[28px] border border-border bg-card px-8 pb-10 pt-16 shadow-2xl sm:px-10">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close badge details"
                className="absolute right-8 top-8 inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
              >
                <X size={21} strokeWidth={2} />
              </button>

              <div className="flex flex-col items-center text-center">
                <Image
                  src={badgeImage}
                  alt={`${badge.name} badge`}
                  width={128}
                  height={144}
                  className="h-auto w-[128px] object-contain"
                />
                <h3 className="mt-3 text-2xl font-semibold leading-none text-foreground">
                  {badge.name}
                </h3>
                <p className="mt-4 whitespace-pre-line text-center text-base font-medium leading-snug text-foreground sm:text-lg">
                  {getBadgeDescription(badge.isClaimed)}
                </p>

                <div className="mt-6 inline-flex h-9 items-center justify-center rounded-full bg-white/[0.06] px-4 text-sm font-semibold text-foreground">
                  Perks
                </div>

                <div className="mt-5 flex w-full items-center gap-4 rounded-[28px] border border-border px-6 py-5 text-left sm:px-7">
                  <Image
                    src={starIcon}
                    alt=""
                    width={14}
                    height={14}
                    className="shrink-0"
                  />
                  <p className="text-base font-medium leading-relaxed text-foreground sm:text-lg">
                    Squire Badge holders get a daily limit of 40 AI messages.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const ClaimingBadgeModal = ({ isOpen }: { isOpen: boolean }) => (
  <AnimatePresence>
    {isOpen ? (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[92] bg-black/70 backdrop-blur-md"
        />
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.97 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="fixed inset-0 z-[93] flex items-center justify-center px-4 py-6"
        >
          <div className="relative w-full max-w-[34rem] overflow-hidden rounded-[2rem] border border-white/8 bg-card px-6 pb-8 pt-9 shadow-[0_30px_90px_rgba(0,0,0,0.68)] sm:px-9">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            <div className="mx-auto max-w-[24rem] text-center sm:max-w-none">
              <p className="text-[0.78rem] font-semibold uppercase tracking-[0.22em] text-[#8B9199]">
                Claiming Badge
              </p>
              <h3 className="mt-3 text-[1.15rem] font-semibold leading-tight text-foreground sm:text-[1.45rem] sm:whitespace-nowrap">
                Minting your Squire badge on Tower
              </h3>
              <p className="mx-auto mt-2 max-w-[20rem] text-center text-sm leading-6 text-[#9AA0A8] sm:max-w-[22rem]">
                We&apos;re sealing your first badge and updating your profile.
              </p>
            </div>

            <div className="relative mx-auto mt-9 flex w-full max-w-[22rem] items-center justify-center gap-3 sm:gap-6">
              <motion.div
                animate={{
                  x: [0, 8, 0],
                  y: [0, -4, 0],
                  opacity: [0.94, 0.7, 0.94],
                  scale: [1, 0.98, 1],
                }}
                transition={{
                  duration: 1.8,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "easeInOut",
                }}
                className="relative z-10"
              >
                <Image
                  src={badgeUnclaimedImage}
                  alt="Silver Squire badge"
                  width={148}
                  height={168}
                  className="h-auto w-[7.1rem] object-contain opacity-95 sm:w-[8.2rem]"
                />
              </motion.div>

              <motion.div
                animate={{
                  opacity: [0.14, 0.32, 0.14],
                  scaleX: [0.88, 1.08, 0.88],
                }}
                transition={{
                  duration: 1.3,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "easeInOut",
                }}
                className="absolute left-1/2 top-1/2 h-[2px] w-[7rem] -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-transparent via-[#7BB8FF] to-transparent sm:w-[8.5rem]"
              />

              <motion.div
                animate={{
                  x: [0, -8, 0],
                  y: [0, 4, 0],
                  scale: [0.96, 1.04, 0.96],
                  rotate: [0, 2, 0],
                }}
                transition={{
                  duration: 1.8,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "easeInOut",
                }}
                className="relative z-10"
              >
                <div className="absolute inset-0 rounded-full bg-[#9c6337]/18 blur-2xl" />
                <Image
                  src={badgeClaimedImage}
                  alt="Claimed Squire badge"
                  width={148}
                  height={168}
                  className="relative h-auto w-[7.1rem] object-contain sm:w-[8.2rem]"
                />
              </motion.div>
            </div>
          </div>
        </motion.div>
      </>
    ) : null}
  </AnimatePresence>
);

const BadgeCongratulationsModal = ({
  isOpen,
  onClose,
  onViewBadge,
}: {
  isOpen: boolean;
  onClose: () => void;
  onViewBadge: () => void;
}) => (
  <AnimatePresence>
    {isOpen ? (
      <>
        <motion.button
          type="button"
          aria-label="Close badge congratulations"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[94] bg-black/70 backdrop-blur-md"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="fixed inset-0 z-[95] flex items-center justify-center px-4 py-6"
        >
          <div className="relative w-full max-w-[28rem] rounded-[2rem] border border-white/6 bg-card px-4 pb-8 pt-5 shadow-[0_30px_90px_rgba(0,0,0,0.68)] sm:px-8">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close badge congratulations"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X size={20} strokeWidth={2} />
              </button>
            </div>

            <div className="mt-2 flex justify-center">
              <div className="inline-flex max-w-full items-center justify-center gap-1.5 whitespace-nowrap text-center sm:gap-2">
                <Image
                  src={starIcon}
                  alt=""
                  width={13}
                  height={13}
                  className="h-[0.76rem] w-[0.76rem] shrink-0 opacity-95 sm:h-[0.82rem] sm:w-[0.82rem]"
                />
                <p className="text-[0.72rem] font-medium leading-none whitespace-nowrap text-foreground sm:text-[0.86rem] sm:leading-6 md:text-[0.9rem]">
                  Congratulations, you&apos;ve claimed the Squire Badge
                </p>
              </div>
            </div>

            <div className="mt-8 flex justify-center">
              <Image
                src={badgeClaimedImage}
                alt="Claimed Squire badge"
                width={162}
                height={182}
                className="h-auto w-[8.8rem] object-contain sm:w-[9.6rem]"
              />
            </div>

            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={onViewBadge}
                className="inline-flex h-[3rem] min-w-[14.8rem] items-center justify-center rounded-full bg-[#78AFFF] px-8 text-[1.08rem] font-semibold text-black transition-opacity hover:opacity-90"
              >
                View Badge
              </button>
            </div>
          </div>
        </motion.div>
      </>
    ) : null}
  </AnimatePresence>
);

type BadgesProps = {
  walletAddress?: string | null;
  isWalletConnected?: boolean;
  highlightedBadgeId?: string | null;
  countdownOpenKey?: number;
  onSquireBadgeStatusChange?: (status: SquireBadgeStatus | null) => void;
};

const Badges = ({
  walletAddress = null,
  isWalletConnected = false,
  highlightedBadgeId = null,
  countdownOpenKey = 0,
  onSquireBadgeStatusChange,
}: BadgesProps) => {
  const router = useRouter();
  const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null);
  const [showCountdownModal, setShowCountdownModal] = useState(
    highlightedBadgeId !== "squire",
  );
  const [squireBadgeStatus, setSquireBadgeStatus] =
    useState<SquireBadgeStatus | null>(null);
  const [isCheckingSquireBadge, setIsCheckingSquireBadge] = useState(false);
  const [isClaimingSquireBadge, setIsClaimingSquireBadge] = useState(false);
  const [showClaimCongratulations, setShowClaimCongratulations] = useState(false);
  const [badgeError, setBadgeError] = useState<string | null>(null);
  const normalizedWalletAddress = walletAddress?.trim().toLowerCase() ?? null;

  const handleCloseCountdown = useCallback(() => {
    setShowCountdownModal(false);
  }, []);

  useEffect(() => {
    if (!normalizedWalletAddress) {
      setSquireBadgeStatus(null);
      setBadgeError(null);
      setIsCheckingSquireBadge(false);
      return;
    }

    let cancelled = false;

    const loadSquireBadgeStatus = async () => {
      setIsCheckingSquireBadge(true);
      setBadgeError(null);

      try {
        const { response, result } = await fetchSquireBadgeStatus(
          normalizedWalletAddress,
        );

        if (cancelled) {
          return;
        }

        if (!response.ok || !result.success || !result.badge) {
          setBadgeError(getBadgeErrorLabel(result.message, result.debug));
          setSquireBadgeStatus(null);
          return;
        }

        setSquireBadgeStatus(result.badge);
      } catch (error) {
        console.error("Failed to load squire badge status:", error);

        if (!cancelled) {
          setBadgeError("Unable to check badge eligibility.");
          setSquireBadgeStatus(null);
        }
      } finally {
        if (!cancelled) {
          setIsCheckingSquireBadge(false);
        }
      }
    };

    void loadSquireBadgeStatus();

    return () => {
      cancelled = true;
    };
  }, [normalizedWalletAddress]);

  useEffect(() => {
    onSquireBadgeStatusChange?.(squireBadgeStatus);
  }, [onSquireBadgeStatusChange, squireBadgeStatus]);

  useEffect(() => {
    if (highlightedBadgeId === "squire" && squireBadgeStatus?.isClaimed) {
      setShowCountdownModal(false);
      setSelectedBadgeId("squire");
    }
  }, [highlightedBadgeId, squireBadgeStatus?.isClaimed]);

  useEffect(() => {
    if (countdownOpenKey > 0) {
      setSelectedBadgeId(null);
      setShowCountdownModal(true);
    }
  }, [countdownOpenKey]);

  const displayBadges = useMemo(
    () =>
      badges.map((badge) =>
        badge.id === "squire"
          ? {
              ...badge,
              isClaimed: squireBadgeStatus?.isClaimed === true,
            }
          : badge,
      ),
    [squireBadgeStatus?.isClaimed],
  );
  const selectedBadge =
    displayBadges.find((badge) => badge.id === selectedBadgeId) ?? null;
  const canClaimSquireBadge =
    isWalletConnected &&
    Boolean(normalizedWalletAddress) &&
    squireBadgeStatus?.isEligible === true &&
    squireBadgeStatus.isClaimed !== true &&
    !isCheckingSquireBadge &&
    !isClaimingSquireBadge;
  const isClaimButtonDisabled =
    !canClaimSquireBadge ||
    isCheckingSquireBadge ||
    isClaimingSquireBadge ||
    squireBadgeStatus?.isClaimed === true;
  const claimButtonLabel = squireBadgeStatus?.isClaimed
    ? "Claimed"
    : isCheckingSquireBadge
        ? "Checking..."
        : "Claim Badge";

  const handleClaimSquireBadge = async () => {
    if (!normalizedWalletAddress || !canClaimSquireBadge) {
      return;
    }

    setIsClaimingSquireBadge(true);
    setBadgeError(null);

    try {
      const { response, result } = await claimSquireBadge(
        normalizedWalletAddress,
      );

      if (!response.ok || !result.success || !result.badge) {
        setBadgeError(getBadgeErrorLabel(result.message, result.debug));

        if (result.badge) {
          setSquireBadgeStatus(result.badge);
        }
        return;
      }

      setSquireBadgeStatus(result.badge);
      setShowClaimCongratulations(true);
    } catch (error) {
      console.error("Failed to claim squire badge:", error);
      setBadgeError("Unable to claim badge right now.");
    } finally {
      setIsClaimingSquireBadge(false);
    }
  };

  const handleViewBadge = () => {
    setShowClaimCongratulations(false);
    setSelectedBadgeId(null);
    router.replace("/profile?tab=badges", { scroll: false });
  };

  return (
    <>
      <motion.section
        key="badges"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden rounded-2xl border border-border bg-card px-6 py-8 sm:px-11 lg:min-h-[296px] lg:px-11 lg:py-12"
      >
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(280px,1fr)_minmax(440px,0.95fr)]">
          <div className="max-w-[490px]">
            <h3 className="text-xl font-semibold text-foreground sm:text-[22px]">
              Collect Tower Badges
            </h3>
            <p className="mt-3 max-w-[460px] text-base leading-snug text-foreground sm:text-lg">
              Earn badges by completing milestones, participating in events, and
              engaging with the ecosystem.
            </p>
            <button
              type="button"
              disabled={isClaimButtonDisabled}
              onClick={handleClaimSquireBadge}
              className={`mt-7 inline-flex h-9 min-w-[162px] items-center justify-center rounded-full px-6 text-base font-semibold transition-all ${
                canClaimSquireBadge
                  ? "bg-primary text-black hover:opacity-90"
                  : "cursor-not-allowed bg-muted text-muted-foreground"
              }`}
            >
              {claimButtonLabel}
            </button>

            {badgeError ? (
              <p className="mt-3 text-sm font-medium text-[#ff9a9a]">
                {badgeError}
              </p>
            ) : null}
          </div>

          <div className="flex w-full justify-center lg:justify-end">
            <div className="grid w-full max-w-[430px] grid-cols-3 items-start gap-4 sm:gap-7 lg:max-w-[460px] lg:gap-10">
              {displayBadges.map((badge) => {
                const badgeImage = badge.isMystery
                  ? mysteryBadgeImage
                  : badge.isClaimed
                    ? badgeClaimedImage
                    : badgeUnclaimedImage;
                const badgeContent = (
                  <>
                    <Image
                      src={badgeImage}
                      alt={badge.alt}
                      width={128}
                      height={144}
                      className="h-auto w-[70px] object-contain sm:w-[88px] lg:w-[104px]"
                    />
                    <div className="mt-4 h-8 text-center text-xl font-semibold leading-none text-foreground sm:text-2xl">
                      {badge.name}
                    </div>
                  </>
                );

                if (!badge.isInteractive) {
                  return (
                    <div
                      key={badge.id}
                      className="flex min-w-0 flex-col items-center"
                    >
                      {badgeContent}
                    </div>
                  );
                }

                return (
                  <button
                    key={badge.id}
                    type="button"
                    onClick={() => {
                      if (badge.isMystery) {
                        setSelectedBadgeId(null);
                        setShowCountdownModal(true);
                        return;
                      }

                      setShowCountdownModal(false);
                      setSelectedBadgeId(badge.id);
                    }}
                    className="group flex min-w-0 flex-col items-center rounded-xl outline-none transition-transform hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-primary/70"
                    aria-label={
                      badge.isMystery
                        ? "Open Arctober badge countdown"
                        : `Open ${badge.name} badge details`
                    }
                  >
                    {badgeContent}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </motion.section>

      <CountdownBadgeModal
        isOpen={showCountdownModal}
        onClose={handleCloseCountdown}
      />
      <BadgeDetailsModal
        badge={selectedBadge}
        onClose={() => setSelectedBadgeId(null)}
      />
      <ClaimingBadgeModal isOpen={isClaimingSquireBadge} />
      <BadgeCongratulationsModal
        isOpen={showClaimCongratulations}
        onClose={() => setShowClaimCongratulations(false)}
        onViewBadge={handleViewBadge}
      />
    </>
  );
};

export default Badges;
