"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type BridgeNetworkMode,
  storeBridgeNetworkMode,
} from "@/lib/bridgeNetworks";

export function useTowerNetworkMode() {
  const [mode] = useState<BridgeNetworkMode>("mainnet");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    storeBridgeNetworkMode("mainnet");
    setIsReady(true);
  }, []);

  const setNetworkMode = useCallback((next: BridgeNetworkMode) => {
    void next;
    storeBridgeNetworkMode("mainnet");
  }, []);

  return { mode, setNetworkMode, isReady };
}
