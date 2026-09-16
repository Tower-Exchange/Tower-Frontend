"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type BridgeNetworkMode,
  TOWER_NETWORK_MODE_EVENT,
  readStoredBridgeNetworkMode,
  storeBridgeNetworkMode,
} from "@/lib/bridgeNetworks";

export function useTowerNetworkMode() {
  const [mode, setModeState] = useState<BridgeNetworkMode>("testnet");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setModeState(readStoredBridgeNetworkMode());
    setIsReady(true);

    const handleModeChange = (event: Event) => {
      const next = (event as CustomEvent<BridgeNetworkMode>).detail;
      if (next === "mainnet" || next === "testnet") {
        setModeState(next);
      }
    };

    window.addEventListener(TOWER_NETWORK_MODE_EVENT, handleModeChange);
    return () => {
      window.removeEventListener(TOWER_NETWORK_MODE_EVENT, handleModeChange);
    };
  }, []);

  const setNetworkMode = useCallback((next: BridgeNetworkMode) => {
    storeBridgeNetworkMode(next);
    setModeState(next);
  }, []);

  return { mode, setNetworkMode, isReady };
}
