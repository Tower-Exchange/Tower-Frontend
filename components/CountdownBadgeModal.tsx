"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import mysteryBadgeImage from "@/public/assets/mystery badge.svg";

/** Arc mainnet launch: 9 days from 7 Sep 2026. */
export const ARC_MAINNET_LAUNCH_AT = "2026-09-16T15:00:00.000Z";

const COUNTDOWN_UNITS = [
  { key: "days", label: "days" },
  { key: "hours", label: "hours" },
  { key: "minutes", label: "min" },
  { key: "seconds", label: "Sec" },
] as const;

type CountdownUnitKey = (typeof COUNTDOWN_UNITS)[number]["key"];
type CountdownParts = Record<CountdownUnitKey, number>;

const padCountdownValue = (value: number) =>
  String(Math.max(0, value)).padStart(2, "0");

export const getCountdownParts = (
  targetMs: number,
  nowMs: number,
): CountdownParts => {
  const totalSeconds = Math.max(0, Math.floor((targetMs - nowMs) / 1000));

  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
};

type CountdownBadgeModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const CountdownBadgeModal = ({
  isOpen,
  onClose,
}: CountdownBadgeModalProps) => {
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updateNow = () => setNowMs(Date.now());
    updateNow();
    const intervalId = window.setInterval(updateNow, 1000);

    return () => window.clearInterval(intervalId);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isMounted) {
    return null;
  }

  const countdown = getCountdownParts(
    Date.parse(ARC_MAINNET_LAUNCH_AT),
    nowMs ?? Date.parse(ARC_MAINNET_LAUNCH_AT),
  );

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="countdown-badge-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="countdown-badge-title"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="relative flex w-full max-w-[580px] flex-col items-center rounded-[28px] border border-border bg-card px-8 pb-10 pt-12 shadow-2xl sm:px-10"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close countdown"
              className="absolute right-8 top-8 inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
            >
              <X size={21} strokeWidth={2} />
            </button>

            <div className="flex w-full flex-col items-center text-center">
              <Image
                src={mysteryBadgeImage}
                alt="Mystery badge"
                width={128}
                height={144}
                className="h-auto w-[128px] object-contain"
                priority
              />

              <p
                id="countdown-badge-title"
                className="mt-6 max-w-[22rem] text-center text-base font-medium leading-snug text-foreground sm:text-lg"
              >
                To kick off Arctember, we&apos;ve got two special badges coming
                your way.
              </p>

              <div className="mt-8 flex w-full items-center justify-center rounded-[28px] border border-border bg-white/[0.03] px-6 py-5 sm:px-8">
                {COUNTDOWN_UNITS.map((unit, index) => (
                  <div key={unit.key} className="flex items-end">
                    {index > 0 ? (
                      <span className="mb-[1.15rem] px-2.5 text-lg font-medium leading-none text-foreground">
                        :
                      </span>
                    ) : null}
                    <div className="flex min-w-[2.85rem] flex-col items-center">
                      <span className="text-[1.55rem] font-semibold leading-none tabular-nums tracking-tight text-foreground">
                        {padCountdownValue(countdown[unit.key])}
                      </span>
                      <span className="mt-1.5 text-[0.68rem] leading-none text-muted-foreground">
                        {unit.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-6 text-center text-base font-medium text-foreground">
                Mainnet Countdown
              </p>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
};
