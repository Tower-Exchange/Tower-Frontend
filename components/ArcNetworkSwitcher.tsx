"use client";

import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { useAccount, useSwitchChain } from "wagmi";
import { getArcNetworkLabel } from "@/lib/arcNetwork";
import { ensureWalletOnArcNetwork } from "@/lib/arcWalletNetwork";
import type { BridgeNetworkMode } from "@/lib/bridgeNetworks";
import { useTowerNetworkMode } from "@/lib/hooks/useTowerNetworkMode";

const NETWORK_OPTIONS: Array<{
  id: BridgeNetworkMode;
  label: string;
  description: string;
}> = [
  // {
  //   id: "testnet",
  //   label: "Arc Testnet",
  //   description: "Chain ID 5042002",
  // },
  {
    id: "mainnet",
    label: "Arc Mainnet",
    description: "Chain ID 5042",
  },
];

type ArcNetworkSwitcherProps = {
  compact?: boolean;
};

export default function ArcNetworkSwitcher({
  compact = false,
}: ArcNetworkSwitcherProps) {
  const { mode, setNetworkMode } = useTowerNetworkMode();
  const { isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const currentLabel = compact
    ? mode === "mainnet"
      ? "Mainnet"
      : "Testnet"
    : getArcNetworkLabel(mode);

  const selectNetwork = async (next: BridgeNetworkMode) => {
    if (next === mode) {
      setOpen(false);
      return;
    }

    setSwitching(true);
    try {
      if (isConnected) {
        await ensureWalletOnArcNetwork(next, switchChainAsync);
      }
      setNetworkMode(next);
      setOpen(false);
    } catch (error) {
      console.error("Failed to switch Arc network:", error);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="relative">
      <motion.button
        type="button"
        className={`flex items-center rounded-lg bg-secondary transition-colors hover:bg-secondary/80 ${
          compact ? "gap-2 px-3 py-2" : "gap-2 px-4 py-2"
        }`}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setOpen((value) => !value)}
        disabled={switching}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Current network ${getArcNetworkLabel(mode)}. Open Arc network menu.`}
      >
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/30">
          <Image
            src="/assets/ARCSvg.svg"
            alt=""
            width={40}
            height={40}
            className="object-contain"
          />
        </div>
        <span
          className={`font-medium text-foreground ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          {switching ? "Switching…" : currentLabel}
        </span>
        <ChevronDown
          className={`text-muted-foreground transition-transform ${
            compact ? "h-3.5 w-3.5" : "h-4 w-4"
          } ${open ? "rotate-180" : ""}`}
        />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xl backdrop-blur-md"
              role="listbox"
              aria-label="Arc networks"
            >
              <div className="p-1.5">
                {NETWORK_OPTIONS.map((option) => {
                  const selected = option.id === mode;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={switching}
                      className={`flex w-full items-center justify-between rounded-lg px-3.5 py-2 text-left transition-colors ${
                        selected
                          ? "bg-primary/15 text-primary"
                          : "text-foreground hover:bg-secondary"
                      }`}
                      onClick={() => {
                        void selectNetwork(option.id);
                      }}
                    >
                      <span>
                        <span className="block text-sm font-medium">
                          {option.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                      {selected ? <Check className="h-4 w-4" /> : null}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
