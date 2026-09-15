"use client";

import type { BridgeNetworkMode } from "@/lib/bridgeNetworks";

type BridgeNetworkTabsProps = {
  mode: BridgeNetworkMode;
  onChange: (mode: BridgeNetworkMode) => void;
  className?: string;
};

const TABS: Array<{ id: BridgeNetworkMode; label: string }> = [
  { id: "testnet", label: "Testnet" },
  { id: "mainnet", label: "Mainnet" },
];

export default function BridgeNetworkTabs({
  mode,
  onChange,
  className,
}: BridgeNetworkTabsProps) {
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full bg-[#121211] p-1 ${className ?? ""}`}
      role="tablist"
      aria-label="Bridge network"
    >
      {TABS.map((tab) => {
        const isActive = mode === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              isActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
